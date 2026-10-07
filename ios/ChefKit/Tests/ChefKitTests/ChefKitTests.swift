import Foundation
import Testing
@testable import ChefKit

@Suite struct ChefKitTests {
    private func request(screen: String? = nil, ref: String? = nil, description: String = "", transcript: String = "")
        -> ChefRequest {
        ChefRequest(id: "r1", title: "Make it blue", description: description, transcript: transcript,
                    screenshotFiles: [], audioFile: nil, screen: screen, ref: ref, createdAt: 0)
    }

    private func json(_ v: ChefValue) throws -> [String: Any] {
        let d = try JSONEncoder().encode(v)
        return try #require(try JSONSerialization.jsonObject(with: d) as? [String: Any])
    }

    @Test func submitArgsMatchContract() throws {
        let r = request(screen: "book", ref: "abc", description: "Details", transcript: "said")
        let args = ChefSubmission.args(for: r, screenshotIds: ["s1", "s2"], audioId: "a1")
        let obj = try json(.object(args))
        #expect(Set(obj.keys) == ["title", "description", "transcript", "screenshotStorageIds", "audioStorageId", "context"])
        #expect(obj["title"] as? String == "Make it blue")
        #expect(obj["screenshotStorageIds"] as? [String] == ["s1", "s2"])
        #expect(obj["audioStorageId"] as? String == "a1")
        #expect(obj["context"] as? [String: String] == ["screen": "book", "ref": "abc"])
    }

    @Test func optionalKeysAreOmittedNotNull() throws {
        let args = ChefSubmission.args(for: request(), screenshotIds: ["1", "2", "3", "4", "5"], audioId: nil)
        let obj = try json(.object(args))
        #expect(Set(obj.keys) == ["title", "screenshotStorageIds"])
        #expect((obj["screenshotStorageIds"] as? [String])?.count == 4)
    }

    @Test func titleFromFirstSentence() {
        #expect(ChefDraft.firstSentence("Make the button bigger. Also blue.") == "Make the button bigger")
        #expect(ChefDraft.firstSentence(String(repeating: "a", count: 100)).count == 78)
    }

    @Test func speechRestartDetection() {
        #expect(ChefRecorder.speechRestarted(old: "make the button bigger please", new: "also blue"))
        #expect(!ChefRecorder.speechRestarted(old: "make the button bigger", new: "make the button"))
    }
}
