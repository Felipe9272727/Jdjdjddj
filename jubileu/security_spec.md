# Firebase Security Specification

## 1. Data Invariants
- Players can only update their own position in the `/worlds/{worldId}/players/{userId}` collection.
- A player record must strictly adhere to the `PlayerPosition` schema (x, y, z, ry, updatedAt, state).
- The `updatedAt` must be a valid server timestamp.
- The `userId` path variable must match the `request.auth.uid`.

## 2. The "Dirty Dozen" Payloads
1. Create with missing fields
2. Create with extra fields (Shadow Update)
3. Update with missing fields
4. Update with extra fields (Shadow Update)
5. Update other player's position (Spoofing)
6. Fake Timestamp (Client-provided time)
7. Invalid Data Type for `x` (String instead of Number)
8. Invalid State string length (> 32)
9. Delete other player's position
10. Unauthenticated Create
11. Unauthenticated Read
12. Read other player's private data (N/A, list is allowed but we must restrict appropriately if needed)

## 3. Test Runner
Will be implemented in `firestore.rules.test.ts`
