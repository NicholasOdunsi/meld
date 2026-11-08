/// The `{ "error": { "code", "message" } }` body every shelf route returns on failure.
struct ShelfErrorEnvelope: Decodable {
    let error: ShelfErrorBody
}
