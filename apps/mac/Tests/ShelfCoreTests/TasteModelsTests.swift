// TasteModelsTests.swift
import Foundation
import Testing
@testable import ShelfCore

struct TasteModelsTests {
    static let boardJSON = """
    {"designLanguage":["minimal"],"colors":[{"hex":"#ffffff","role":"base"},{"hex":"#ff5a36","role":"accent"}],
     "typography":{"weight":"regular","tracking":"normal","note":""},"spacing":"generous","density":"airy",
     "layoutHabits":["Single column forms"],"signatureDetails":[],"avoid":[{"text":"gradients","source":"typed"}]}
    """

    @Test func decodesAReadyResponse() throws {
        let json = """
        {"status":"ready","board":\(Self.boardJSON),"version":3,"appleRules":true,
         "pending":[{"id":"44444444-4444-4444-8444-444444444444","tile":"density","op":"set","value":"balanced","reason":"Seen lately","evidenceItemIds":[]}]}
        """
        let response = try JSONDecoder().decode(TasteResponse.self, from: Data(json.utf8))
        guard case .ready(let snapshot) = response else { Issue.record("expected ready"); return }
        #expect(snapshot.version == 3)
        #expect(snapshot.appleRules)
        #expect(snapshot.board.density == .airy)
        #expect(snapshot.board.colors[1].role == .accent)
        #expect(snapshot.pending.first?.value == .string("balanced"))
    }

    @Test func decodesLearning() throws {
        let response = try JSONDecoder().decode(TasteResponse.self, from: Data(#"{"status":"learning"}"#.utf8))
        #expect(response == .learning)
    }

    @Test func settingATileChangesOnlyThatTile() throws {
        let board = try JSONDecoder().decode(TasteBoard.self, from: Data(Self.boardJSON.utf8))
        let next = try #require(board.setting(.density, to: .string("dense")))
        #expect(next.density == .dense)
        #expect(next.spacing == board.spacing)
        #expect(board.density == .airy)
    }

    @Test func settingAnInvalidValueReturnsNil() throws {
        let board = try JSONDecoder().decode(TasteBoard.self, from: Data(Self.boardJSON.utf8))
        #expect(board.setting(.density, to: .string("roomy")) == nil)
    }

    @Test func valueForATileRoundTrips() throws {
        let board = try JSONDecoder().decode(TasteBoard.self, from: Data(Self.boardJSON.utf8))
        #expect(board.value(for: .spacing) == .string("generous"))
        #expect(board.setting(.layoutHabits, to: board.value(for: .layoutHabits)) == board)
    }
}
