import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum ClaudeError: Error, LocalizedError, Sendable {
    case missingAPIKey
    case http(status: Int, type: String?, message: String)
    case refusal(category: String?, explanation: String?)
    case emptyResponse
    case transport(String)

    public var errorDescription: String? {
        switch self {
        case .missingAPIKey:
            return "Add your Anthropic API key in Settings first."
        case let .http(status, type, message):
            return "API error \(status)\(type.map { " (\($0))" } ?? ""): \(message)"
        case let .refusal(category, explanation):
            return "The model declined this request" + (category.map { " [\($0)]" } ?? "") + (explanation.map { ": \($0)" } ?? ".")
        case .emptyResponse:
            return "The model returned no text."
        case let .transport(msg):
            return "Network error: \(msg)"
        }
    }
}

public struct ClaudeReply: Sendable, Equatable {
    public let text: String
    public let model: String
    public let stopReason: String
    public let inputTokens: Int
    public let outputTokens: Int
}

/// Minimal client for the Anthropic Messages API (`POST /v1/messages`).
public struct ClaudeClient: Sendable {
    public static let defaultModel = "claude-opus-5"
    public static let apiVersion = "2023-06-01"

    public var apiKey: String
    public var model: String
    public var baseURL: URL
    public var session: URLSession

    public init(apiKey: String, model: String = ClaudeClient.defaultModel,
                baseURL: URL = URL(string: "https://api.anthropic.com")!,
                session: URLSession? = nil) {
        self.apiKey = apiKey
        self.model = model
        self.baseURL = baseURL
        if let session {
            self.session = session
        } else {
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 600
            config.timeoutIntervalForResource = 600
            self.session = URLSession(configuration: config)
        }
    }

    // MARK: Wire types

    struct RequestBody: Encodable {
        struct Message: Encodable {
            let role: String
            let content: String
        }
        struct Thinking: Encodable { let type: String }
        let model: String
        let max_tokens: Int
        let fallbacks: String
        let thinking: Thinking
        let system: String
        let messages: [Message]
    }

    struct ResponseBody: Decodable {
        struct Block: Decodable {
            let type: String
            let text: String?
        }
        struct Usage: Decodable {
            let input_tokens: Int?
            let output_tokens: Int?
        }
        struct StopDetails: Decodable {
            let category: String?
            let explanation: String?
        }
        let model: String?
        let stop_reason: String?
        let stop_details: StopDetails?
        let content: [Block]
        let usage: Usage?
    }

    struct ErrorBody: Decodable {
        struct Inner: Decodable {
            let type: String?
            let message: String?
        }
        let error: Inner?
    }

    public func makeRequest(system: String, userMessage: String, maxTokens: Int) throws -> URLRequest {
        var req = URLRequest(url: baseURL.appendingPathComponent("v1/messages"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        req.setValue(Self.apiVersion, forHTTPHeaderField: "anthropic-version")
        // Server-side refusal fallback: if a safety classifier declines, the API retries on a suitable model.
        req.setValue("server-side-fallback-2026-07-01", forHTTPHeaderField: "anthropic-beta")
        let body = RequestBody(
            model: model,
            max_tokens: maxTokens,
            fallbacks: "default",
            thinking: .init(type: "adaptive"),
            system: system,
            messages: [.init(role: "user", content: userMessage)]
        )
        req.httpBody = try JSONEncoder().encode(body)
        return req
    }

    /// Single-turn completion. Non-streaming; the feedback is short so this is fine.
    public func complete(system: String, userMessage: String, maxTokens: Int = 8000) async throws -> ClaudeReply {
        let trimmedKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedKey.isEmpty else { throw ClaudeError.missingAPIKey }
        let req = try makeRequest(system: system, userMessage: userMessage, maxTokens: maxTokens)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw ClaudeError.transport(error.localizedDescription)
        }
        return try Self.parse(data: data, response: response)
    }

    public static func parse(data: Data, response: URLResponse) throws -> ClaudeReply {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let decoder = JSONDecoder()
        guard (200..<300).contains(status) else {
            let err = try? decoder.decode(ErrorBody.self, from: data)
            let message = err?.error?.message ?? String(data: data, encoding: .utf8) ?? "unknown error"
            throw ClaudeError.http(status: status, type: err?.error?.type, message: message)
        }
        let body = try decoder.decode(ResponseBody.self, from: data)
        if body.stop_reason == "refusal" {
            throw ClaudeError.refusal(category: body.stop_details?.category, explanation: body.stop_details?.explanation)
        }
        let text = body.content.filter { $0.type == "text" }.compactMap(\.text).joined(separator: "\n")
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw ClaudeError.emptyResponse }
        return ClaudeReply(
            text: text,
            model: body.model ?? "",
            stopReason: body.stop_reason ?? "",
            inputTokens: body.usage?.input_tokens ?? 0,
            outputTokens: body.usage?.output_tokens ?? 0
        )
    }
}
