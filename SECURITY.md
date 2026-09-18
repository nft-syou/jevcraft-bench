# Security

Report vulnerabilities privately to the repository owner via GitHub's security advisory
feature rather than a public issue.

Scope notes:

- The API key is only ever read from `TYPESAFE_API_KEY`. If you find a code path that
  reads it from a file or logs it, that is a bug.
- Datasets must not contain personal data. Player identifiers are HMAC pseudonyms.
- This project produces review requests only. Any change that acts on players automatically
  is out of scope and should be rejected in review.
