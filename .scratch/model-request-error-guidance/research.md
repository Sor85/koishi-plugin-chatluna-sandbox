# ChatLuna model-request error guidance research

Research snapshot: ChatLuna `69732edfffe57e7ab8656b09c05c264a8bb54eb9`, chatluna-character `48b5e66968c605c6f56de38875d381eea92a9706`, official docs `87146297aa5c00ff035aff19d8a5898172341506`. Only first-party source and documentation were used.

## Findings

### 1. How errors are constructed, wrapped, logged, and exposed

- ChatLuna's canonical error is `ChatLunaError extends Error`. Its public fields are `errorCode`, optional `originError`, `isTimeout`, and optional `data`. Its own `message` is deliberately generic: the localized/template text with `%s` replaced by the numeric error code. Construction logs a `ChatLunaError:<code>` separator, then the full `originError` and its `cause` (or the wrapper itself); timeout/abort helpers suppress constructor logging. [source](https://github.com/ChatLunaLab/chatluna/blob/69732edfffe57e7ab8656b09c05c264a8bb54eb9/packages/core/src/utils/error.ts#L4-L75), [official API reference](https://github.com/ChatLunaLab/doc/blob/87146297aa5c00ff035aff19d8a5898172341506/docs/development/api-reference/chatluna-utils/error.md#L1-L31)
- Core classifies request failures with codes `NETWORK_ERROR` (1), `API_REQUEST_TIMEOUT` (102), `API_REQUEST_FAILED` (103), `API_REQUEST_TOKEN_LIMIT` (105), and `ABORTED` (5). The enum also defines API-key, unsafe-content, model-not-found/init/empty-response, and no-available-config codes. [source](https://github.com/ChatLunaLab/chatluna/blob/69732edfffe57e7ab8656b09c05c264a8bb54eb9/packages/core/src/utils/error.ts#L47-L116)
- The shared OpenAI-style adapter preserves provider content in `originError.message`:
  - non-200 response: HTTP `status`, `statusText`, and complete `response.text()`;
  - JSON/SSE error payload: the raw chunk/body, or `response.error.message`;
  - parse failure: parse error plus raw response body.
  These are wrapped under code 103 unless a recognized unsafe-content code is detected, which becomes code 104. [source](https://github.com/ChatLunaLab/chatluna/blob/69732edfffe57e7ab8656b09c05c264a8bb54eb9/packages/shared-adapter/src/requester.ts#L93-L108), [stream handling](https://github.com/ChatLunaLab/chatluna/blob/69732edfffe57e7ab8656b09c05c264a8bb54eb9/packages/shared-adapter/src/requester.ts#L239-L254), [non-stream handling](https://github.com/ChatLunaLab/chatluna/blob/69732edfffe57e7ab8656b09c05c264a8bb54eb9/packages/shared-adapter/src/requester.ts#L398-L485)
- Generic SSE response checking similarly wraps `status`, `statusText`, and response text under code 1. [source](https://github.com/ChatLunaLab/chatluna/blob/69732edfffe57e7ab8656b09c05c264a8bb54eb9/packages/core/src/utils/sse.ts#L141-L156)
- Adapter-specific requesters commonly preserve the caught error as `originError`; some synthesize provider-specific text such as raw Hunyuan/Gemini/Spark/Dify chunks. Thus detail quality varies by adapter, but the intended seam is still `ChatLunaError.originError`. [Hunyuan example](https://github.com/ChatLunaLab/chatluna/blob/69732edfffe57e7ab8656b09c05c264a8bb54eb9/packages/adapter-hunyuan/src/requester.ts#L68-L99), [Gemini example](https://github.com/ChatLunaLab/chatluna/blob/69732edfffe57e7ab8656b09c05c264a8bb54eb9/packages/adapter-gemini/src/requester.ts#L205-L221)
- Core exposes the raw error to plugins through the `chatluna/after-chat-error` event before rethrowing it. Conversation reply streams also receive `{ type: 'error', error }`. [source](https://github.com/ChatLunaLab/chatluna/blob/69732edfffe57e7ab8656b09c05c264a8bb54eb9/packages/core/src/llm-core/chat/app.ts#L64-L96), [event signature](https://github.com/ChatLunaLab/chatluna/blob/69732edfffe57e7ab8656b09c05c264a8bb54eb9/packages/core/src/llm-core/chat/app.ts#L627-L635), [reply stream](https://github.com/ChatLunaLab/chatluna/blob/69732edfffe57e7ab8656b09c05c264a8bb54eb9/packages/core/src/middlewares/conversation/request_conversation.ts#L167-L177)
- ChatLuna's normal chat middleware sends only `ChatLunaError.message` to the user, not `originError.message`; therefore the visible chat text is normally the generic error-code message while provider detail remains in the thrown object/log. [source](https://github.com/ChatLunaLab/chatluna/blob/69732edfffe57e7ab8656b09c05c264a8bb54eb9/packages/core/src/chains/chain.ts#L378-L389)
- Model-list failures are a notable exception: core rewrites the thrown message to `获取模型列表失败 (<platform>): <origin message>` and logs/rethrows it. [source](https://github.com/ChatLunaLab/chatluna/blob/69732edfffe57e7ab8656b09c05c264a8bb54eb9/packages/core/src/llm-core/platform/client.ts#L159-L174)

### chatluna-character behavior

- chatluna-character does not translate model/provider errors into a new public shape. Errors from `model.invoke()` or the agent stream propagate through its async queue, are logged as `model requests failed`, and are rethrown. [source](https://github.com/ChatLunaLab/chatluna-character/blob/48b5e66968c605c6f56de38875d381eea92a9706/src/utils/chain.ts#L398-L415), [model path](https://github.com/ChatLunaLab/chatluna-character/blob/48b5e66968c605c6f56de38875d381eea92a9706/src/plugins/chat.ts#L1742-L1873)
- The outer character response handler catches and logs the error, then releases its lock; it does not send ChatLuna's generic error message to the chat or emit a character-specific error event. Its declared lifecycle events include only before-chat, after-chat, and clear-history. [source](https://github.com/ChatLunaLab/chatluna-character/blob/48b5e66968c605c6f56de38875d381eea92a9706/src/plugins/chat.ts#L2248-L2419), [event declarations](https://github.com/ChatLunaLab/chatluna-character/blob/48b5e66968c605c6f56de38875d381eea92a9706/src/types.ts#L344-L360)
- Character creates `ChatLunaError` itself for preset lookup/load failures, not for provider requests. [source](https://github.com/ChatLunaLab/chatluna-character/blob/48b5e66968c605c6f56de38875d381eea92a9706/src/preset.ts#L124-L140), [load failures](https://github.com/ChatLunaLab/chatluna-character/blob/48b5e66968c605c6f56de38875d381eea92a9706/src/preset.ts#L228-L272)

## 2. Error content available to the sandbox

At a plugin/model-call interception seam, extract explicitly:

| Content | Availability |
| --- | --- |
| `error.name`, `error.message` | Always for an `Error`; for `ChatLunaError`, `message` is ChatLuna's generic localized error-code text. |
| `error.errorCode` | Numeric ChatLuna classification when the object is `ChatLunaError`. |
| `error.originError?.message` | Best first-party source for provider/HTTP detail; often includes raw status, status text, and body. |
| `error.originError?.stack`, `error.originError?.cause` | Present when retained by the original error/adapter; ChatLuna logs `cause` explicitly. |
| `error.isTimeout` | Explicit timeout marker, though code 102 is the stronger display clue. |
| `error.data` | Public extension field. No model/provider population of this field was found in the researched request paths, so do not assume it contains provider details. |
| Raw HTTP `Response` | At an HTTP interception seam around `ChatLunaPlugin.fetch`: URL/request options and returned `Response.status`, `statusText`, headers, and body are available before an adapter consumes the body. ChatLuna's fetch wrapper itself does not normalize HTTP statuses. [source](https://github.com/ChatLunaLab/chatluna/blob/69732edfffe57e7ab8656b09c05c264a8bb54eb9/packages/core/src/services/chat.ts#L1248-L1268), [transport](https://github.com/ChatLunaLab/chatluna/blob/69732edfffe57e7ab8656b09c05c264a8bb54eb9/packages/core/src/utils/request.ts#L99-L119) |

For a failure panel, the grounded display order is: **ChatLuna message/code**, then **`originError.message`**, then captured **raw HTTP status/body** if interception has it. Character's own logs may contain the same error twice due to its inner and outer catches.

## 3. Official troubleshooting mappings

The official error-code table is the authoritative source for code-level causes and asks users to provide logs if its suggestions fail. [official table](https://github.com/ChatLunaLab/doc/blob/87146297aa5c00ff035aff19d8a5898172341506/docs/guide/faq/error_code.md#L1-L58)

| Matching clue | Possible causes/guidance supported by ChatLuna | Confidence |
| --- | --- | --- |
| Code **1** | Network error: check network connection and proxy configuration. | Grounded directly by official error table. |
| Code **2**, or origin text `Unsupported proxy protocol` / proxy URL parse failure | Proxy address/protocol is invalid; check protocol and address formatting. Core accepts HTTP(S) or SOCKS-style proxy URLs and logs a hint about a missing `http://`. [source](https://github.com/ChatLunaLab/chatluna/blob/69732edfffe57e7ab8656b09c05c264a8bb54eb9/packages/core/src/utils/request.ts#L18-L50) | Grounded. |
| Code **100** | API key unavailable/invalid; check that the API key is usable. | Grounded directly by official table. |
| Code **101** | Provider requires a CAPTCHA; log in manually and complete it. | Grounded directly by official table. |
| Code **102** or `isTimeout === true` | Check network, proxy, and API key. Also consider a slow model, long reasoning/context task, or proxy latency; increase timeout only when those apply. [timeout guidance](https://github.com/ChatLunaLab/doc/blob/87146297aa5c00ff035aff19d8a5898172341506/docs/guide/session-related/concurrency-limit-and-retry.md#L55-L73) | Grounded. |
| Code **103** with no more specific detail | Official generic guidance is to check network, proxy, and API key. Preserve the provider body because code 103 alone is intentionally broad. | Grounded for the broad suggestions; any narrower diagnosis needs another clue. |
| Code **103** plus HTTP **5xx** in captured status/origin text | Temporary upstream API failure; ChatLuna documents 5xx as suitable for retry. [retry guidance](https://github.com/ChatLunaLab/doc/blob/87146297aa5c00ff035aff19d8a5898172341506/docs/guide/session-related/concurrency-limit-and-retry.md#L32-L53) | Grounded conditional mapping. |
| Provider body explicitly says rate limit/throttling, or failures correlate with high concurrency | Reduce concurrency; ChatLuna says higher concurrency can trigger upstream rate limiting or proxy congestion, and near-limit failures may succeed on retry. [source](https://github.com/ChatLunaLab/doc/blob/87146297aa5c00ff035aff19d8a5898172341506/docs/guide/session-related/concurrency-limit-and-retry.md#L7-L30) | Grounded only when the body or observed concurrency supplies the clue. |
| Code **104** or origin text `Unsafe content detected` | Unsafe prompt/conversation content; create a new conversation and retry. | Grounded directly by source and official table. |
| Code **301** | Model unavailable/not found or adapter initialization failed; verify model availability and adapter initialization. | Grounded directly by official table. |
| Code **303** | Model initialization failure; check model configuration and network. | Grounded directly by official table. |
| Code **307** | No usable configuration remains; create a new conversation, then check model/embedding/vector configurations. Core can mark repeatedly failing configs unavailable after retry limits. [source](https://github.com/ChatLunaLab/chatluna/blob/69732edfffe57e7ab8656b09c05c264a8bb54eb9/packages/core/src/llm-core/platform/api.ts#L139-L178) | Grounded. |
| Code **309**, or empty/no-response origin text | Check API/network/key as above, and inspect conversation/preset for content the model may refuse; try a new conversation. | Grounded directly by official table. |
| Model-list message `获取模型列表失败 (<platform>): ...` | Use the appended origin reason; configuration, connectivity, credentials, endpoint, or provider response may be shown there. | Grounded that the reason is exposed; the diagnosis depends on its exact text. |
| Repeated transient failures | Retry is appropriate for network jitter, occasional proxy failure, upstream 5xx, or marginal rate limiting. It is not useful for API-key or model-name configuration errors. [source](https://github.com/ChatLunaLab/doc/blob/87146297aa5c00ff035aff19d8a5898172341506/docs/guide/session-related/concurrency-limit-and-retry.md#L32-L53) | Grounded. |

The getting-started guide additionally states that inaccessible regional model APIs require configuring ChatLuna's proxy before testing. [source](https://github.com/ChatLunaLab/doc/blob/87146297aa5c00ff035aff19d8a5898172341506/docs/guide/getting-started.md#L52-L76)

## 4. Boundaries: grounded vs speculative

- **Do not infer a precise cause from code 103 alone.** ChatLuna intentionally collapses many provider failures into `API_REQUEST_FAILED`; use `originError.message` or captured HTTP content.
- **Do not map naked HTTP 401/403/429 to API key, regional blocking, or rate limiting as a ChatLuna fact.** Those are common provider conventions, but the researched ChatLuna docs/source do not define such status-to-cause mappings. A mapping becomes grounded only when the provider body itself states the cause, or a ChatLuna code supplies it.
- **Balance/credits/billing exhaustion is not documented by ChatLuna as a general model-request cause in the researched official material.** Show it only as provider-supplied raw content, not as ChatLuna guidance.
- **Malformed endpoint/base URL, unsupported model capabilities, request-schema mismatch, DNS/TLS failure, and provider outage** may be plausible interpretations of raw errors, but should be labeled “possible” unless the captured provider/transport text says so.
- **Character-specific diagnosis is limited:** chatluna-character preserves and logs the underlying ChatLuna/provider error but does not add model-request cause metadata or a public error event.
