# Security Specification — NTA ExamForge Studio

## 1. Data Invariants
1. **Strict Owner Isolation**: Every user's profile (`/users/{userId}/profile/info`), processed papers (`/users/{userId}/papers/{paperId}`), and CBT attempts (`/users/{userId}/attempts/{attemptId}`) can ONLY be read, created, updated, or deleted when `request.auth != null && request.auth.token.email_verified == true && request.auth.uid == userId`.
2. **Identity Integrity**: `uid` on `UserProfile` and `ownerId` on `ExamPaper` and `ExamAttempt` MUST equal `request.auth.uid` on create and remain immutable on update.
3. **Referential Integrity**: An `ExamAttempt` can only be created if the referenced `paperId` exists at `/users/{userId}/papers/{paperId}`.
4. **Temporal Integrity**: `createdAt == request.time` on create; `createdAt` is immutable and `updatedAt == request.time` on update.
5. **Volumetric & Key Guarding**: All document IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), all strings enforce explicit `.size()` bounds, `questions` list is bounded (`size() > 0 && size() <= 200`), and strict `keys().hasAll(...) && keys().hasOnly(...)` + `affectedKeys().hasOnly(...)` block shadow fields.

## 2. Adversarial Payloads ("Dirty Dozen")
1. **Unauthenticated read** on `/users/u1/profile/info` -> `PERMISSION_DENIED`.
2. **Cross-user read** by `u2` on `/users/u1/papers/p1` -> `PERMISSION_DENIED`.
3. **Unverified email write** (`email_verified: false`) creating `/users/u1/profile/info` -> `PERMISSION_DENIED`.
4. **UID spoofing** (`uid: "u2"`) while authenticated as `u1` -> `PERMISSION_DENIED`.
5. **Shadow/ghost field injection** (`isAdmin: true`) on profile or paper create -> `PERMISSION_DENIED`.
6. **ID poisoning** (`paperId` with 200+ chars or `/../`) -> `PERMISSION_DENIED`.
7. **Client-forged timestamp** (`createdAt` != `request.time`) -> `PERMISSION_DENIED`.
8. **Immutable field mutation** (`ownerId` or `createdAt` altered on update) -> `PERMISSION_DENIED`.
9. **Orphaned attempt write** referencing nonexistent `paperId` -> `PERMISSION_DENIED`.
10. **Oversized title string** (`title.size() > 200`) -> `PERMISSION_DENIED`.
11. **Unbounded questions array** (`questions.size() == 0` or `> 200`) -> `PERMISSION_DENIED`.
12. **Cross-user list query** by `u2` on `/users/u1/attempts` -> `PERMISSION_DENIED`.
