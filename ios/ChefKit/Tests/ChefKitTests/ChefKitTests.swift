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

    @Test func whatsNewFirstLaunchRecordsNowThenReturnsIt() throws {
        let suite = "ChefKitTests.whatsNew.\(UUID().uuidString)"
        let d = try #require(UserDefaults(suiteName: suite))
        defer { d.removePersistentDomain(forName: suite) }
        #expect(ChefWhatsNewStore.seen(prefix: "chef", defaults: d) == nil)
        #expect(ChefWhatsNewStore.sinceForLaunch(prefix: "chef", now: 1000, defaults: d) == nil)
        #expect(d.double(forKey: "ChefKit.whatsNewSeen.chef") == 1000)
        #expect(ChefWhatsNewStore.sinceForLaunch(prefix: "chef", now: 5000, defaults: d) == 1000)
        ChefWhatsNewStore.markSeen(prefix: "chef", at: 4000, defaults: d)
        ChefWhatsNewStore.markSeen(prefix: "chef", at: 2000, defaults: d) // never backwards
        #expect(ChefWhatsNewStore.seen(prefix: "chef", defaults: d) == 4000)
        #expect(ChefWhatsNewStore.seen(prefix: "other", defaults: d) == nil)
    }

    @Test func whatsNewEntryDecodes() throws {
        let json = #"[{"id":"k1","text":"Dark mode is here.","at":1700000000000}]"#
        let rows = try JSONDecoder().decode([ChefWhatsNewEntry].self, from: Data(json.utf8))
        #expect(rows.first?.text == "Dark mode is here.")
        #expect(rows.first?.at == 1_700_000_000_000)
    }

    @Test func speechRestartDetection() {
        #expect(ChefRecorder.speechRestarted(old: "make the button bigger please", new: "also blue"))
        #expect(!ChefRecorder.speechRestarted(old: "make the button bigger", new: "make the button"))
    }
}
