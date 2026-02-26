# Daily Import File Columns (.xlsx)

The first worksheet must include these exact column headers:

1. `Mark`
2. `Invoice Number`
3. `Grade`
4. `Number of Bags`
5. `Net Weight`
6. `Factory`
7. `Date Created` (YYYY-MM-DD)
8. `Cancelled` (optional: `true`/`false`)

Behavior:

- Unique key = `Mark + Invoice Number`
- Existing lot: structural fields update only
- New lot: record created
- No deletions
