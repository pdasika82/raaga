import XCTest
@testable import RaagaCore

final class ClaudeClientTests: XCTestCase {
    func testRequestShape() throws {
        let client = ClaudeClient(apiKey: "sk-test")
        let req = try client.makeRequest(system: "sys", userMessage: "hello", maxTokens: 123)
        XCTAssertEqual(req.url?.absoluteString, "https://api.anthropic.com/v1/messages")
        XCTAssertEqual(req.value(forHTTPHeaderField: "x-api-key"), "sk-test")
        XCTAssertEqual(req.value(forHTTPHeaderField: "anthropic-version"), "2023-06-01")
        XCTAssertEqual(req.value(forHTTPHeaderField: "anthropic-beta"), "server-side-fallback-2026-07-01")
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: XCTUnwrap(req.httpBody)) as? [String: Any])
        XCTAssertEqual(json["model"] as? String, "claude-opus-5")
        XCTAssertEqual(json["max_tokens"] as? Int, 123)
        XCTAssertEqual(json["fallbacks"] as? String, "default")
        XCTAssertEqual((json["thinking"] as? [String: Any])?["type"] as? String, "adaptive")
        XCTAssertEqual(json["system"] as? String, "sys")
        let messages = try XCTUnwrap(json["messages"] as? [[String: Any]])
        XCTAssertEqual(messages.first?["role"] as? String, "user")
        XCTAssertEqual(messages.first?["content"] as? String, "hello")
    }

    func testParsesTextBlocks() throws {
        let body = """
        {"id":"msg_1","model":"claude-opus-5","stop_reason":"end_turn","content":[{"type":"thinking","thinking":""},{"type":"text","text":"Nice work."}],"usage":{"input_tokens":10,"output_tokens":5}}
        """
        let resp = HTTPURLResponse(url: URL(string: "https://api.anthropic.com/v1/messages")!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        let reply = try ClaudeClient.parse(data: Data(body.utf8), response: resp)
        XCTAssertEqual(reply.text, "Nice work.")
        XCTAssertEqual(reply.inputTokens, 10)
        XCTAssertEqual(reply.stopReason, "end_turn")
    }

    func testRefusalIsAnError() {
        let body = """
        {"id":"msg_1","model":"claude-opus-5","stop_reason":"refusal","stop_details":{"type":"refusal","category":"other"},"content":[]}
        """
        let resp = HTTPURLResponse(url: URL(string: "https://api.anthropic.com/v1/messages")!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        XCTAssertThrowsError(try ClaudeClient.parse(data: Data(body.utf8), response: resp)) { error in
            guard case ClaudeError.refusal = error else { return XCTFail("expected refusal, got \(error)") }
        }
    }

    func testHTTPErrorIsSurfaced() {
        let body = #"{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}"#
        let resp = HTTPURLResponse(url: URL(string: "https://api.anthropic.com/v1/messages")!, statusCode: 401, httpVersion: nil, headerFields: nil)!
        XCTAssertThrowsError(try ClaudeClient.parse(data: Data(body.utf8), response: resp)) { error in
            guard case let ClaudeError.http(status, type, message) = error else { return XCTFail("wrong error \(error)") }
            XCTAssertEqual(status, 401)
            XCTAssertEqual(type, "authentication_error")
            XCTAssertEqual(message, "invalid x-api-key")
        }
    }
}
