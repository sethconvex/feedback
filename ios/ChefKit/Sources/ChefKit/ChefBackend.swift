@preconcurrency import Combine
@preconcurrency import ConvexMobile
import Foundation

// MARK: - Arguments

/// A JSON value sent to a Chef function. Sendable, so arguments can cross actors freely.
public enum ChefValue: Sendable, Hashable, Encodable, ConvexEncodable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case array([ChefValue])
    case object([String: ChefValue])
    case null

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let s): try c.encode(s)
        case .number(let n): try c.encode(n)
        case .bool(let b): try c.encode(b)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        case .null: try c.encodeNil()
        }
    }

    /// Bridged to ConvexMobile's argument type.
    public var convexValue: ConvexEncodable? {
        switch self {
        case .string(let s): s
        case .number(let n): n
        case .bool(let b): b
        case .array(let a): a.map(\.convexValue) as [ConvexEncodable?]
        case .object(let o): o.mapValues(\.convexValue) as [String: ConvexEncodable?]
        case .null: nil
        }
    }
}

extension ChefValue: ExpressibleByStringLiteral, ExpressibleByBooleanLiteral, ExpressibleByFloatLiteral,
    ExpressibleByIntegerLiteral, ExpressibleByArrayLiteral, ExpressibleByDictionaryLiteral {
    public init(stringLiteral value: String) { self = .string(value) }
    public init(booleanLiteral value: Bool) { self = .bool(value) }
    public init(floatLiteral value: Double) { self = .number(value) }
    public init(integerLiteral value: Int) { self = .number(Double(value)) }
    public init(arrayLiteral elements: ChefValue...) { self = .array(elements) }
    public init(dictionaryLiteral elements: (String, ChefValue)...) {
        self = .object(Dictionary(elements, uniquingKeysWith: { _, b in b }))
    }
}

// MARK: - Backend

/// What ChefKit needs from a Convex client: run a mutation and subscribe to a query, by full
/// function name ("chef:mine"). `ConvexClient` and `ConvexClientWithAuth` already conform;
/// apps that wrap their client can conform their wrapper instead.
///
/// Calls arrive authenticated as whoever the host's client is signed in as. ChefKit never signs
/// anyone in.
public protocol ChefBackend: AnyObject {
    func chefMutation<T: Decodable & Sendable>(_ name: String, args: [String: ChefValue]) async throws -> T
    func chefSubscribe<T: Decodable & Sendable>(_ name: String, args: [String: ChefValue], as type: T.Type)
        -> AnyPublisher<T, Error>
}

extension ConvexClient: ChefBackend {
    public func chefMutation<T: Decodable & Sendable>(_ name: String, args: [String: ChefValue]) async throws -> T {
        try await mutation(name, with: args.mapValues(\.convexValue))
    }

    public func chefSubscribe<T: Decodable & Sendable>(_ name: String, args: [String: ChefValue], as type: T.Type)
        -> AnyPublisher<T, Error> {
        subscribe(to: name, with: args.mapValues(\.convexValue), yielding: type)
            .mapError { $0 as Error }
            .eraseToAnyPublisher()
    }
}

/// Accepts any JSON result (for mutations whose return value we don't need, e.g. `null`).
struct ChefIgnored: Decodable, Sendable {
    init(from decoder: Decoder) throws {}
}

/// Moves a non-Sendable value across isolation where access is known to be serialized.
struct UnsafeBox<V>: @unchecked Sendable {
    let value: V
    init(_ v: V) { value = v }
}

// MARK: - Errors

enum ChefError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        switch self { case .message(let m): m }
    }
}

enum ChefErrors {
    /// The raw message (ConvexError data, server error first line, …).
    static func message(_ error: Error) -> String {
        if let e = error as? ChefError { return e.localizedDescription }
        if let ce = error as? ClientError {
            switch ce {
            case .ConvexError(let data):
                if let obj = jsonObject(data) {
                    if let m = obj["message"] as? String { return m }
                    if let c = obj["code"] as? String { return c }
                }
                return data
            case .ServerError(let msg): return msg.components(separatedBy: "\n").first ?? msg
            case .InternalError(let msg): return msg
            }
        }
        return error.localizedDescription
    }

    /// The caller isn't signed in (the contract throws ConvexError { code: "UNAUTHENTICATED" }).
    static func isUnauthenticated(_ error: Error) -> Bool {
        if let ce = error as? ClientError, case .ConvexError(let data) = ce {
            if let obj = jsonObject(data), (obj["code"] as? String) == "UNAUTHENTICATED" { return true }
            return data.contains("UNAUTHENTICATED")
        }
        let m = message(error)
        return m.contains("UNAUTHENTICATED") || m.localizedCaseInsensitiveContains("not authenticated")
    }

    /// The host hasn't exported the Chef functions under this prefix (yet).
    static func isMissingFunction(_ error: Error) -> Bool {
        message(error).contains("Could not find public function")
    }

    /// What to show a person: plain words, never request ids or function names.
    static func friendly(_ error: Error) -> String {
        if error is URLError { return "You're offline. Try again when you're connected." }
        if isUnauthenticated(error) { return "Sign in to send requests to Chef." }
        let m = message(error)
        if m.isEmpty || m.contains("[CONVEX") || m.contains("Request ID") || m.contains("Server Error")
            || m.contains("Could not find public function") {
            return "Something went wrong on our side. Please try again."
        }
        return m
    }

    private static func jsonObject(_ s: String) -> [String: Any]? {
        guard let d = s.data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: d, options: [.fragmentsAllowed])) as? [String: Any]
    }
}
