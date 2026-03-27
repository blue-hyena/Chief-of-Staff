# Common failures

- Drive create succeeds, Docs edit fails:
  - Docs API is disabled or still propagating
- Drive create succeeds, Sheets values update fails:
  - Sheets API is disabled or still propagating
- Folder is visible but Google-native creation fails under a service account:
  - wrong auth model for personal Drive
- Nothing is created at all:
  - likely missing write access, wrong folder, or wrong auth context
