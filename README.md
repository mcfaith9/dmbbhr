| # | Scenario | Example punches | What system can reasonably infer | Daily Attendance |
|---|---|---|---|---|
| 1 | Normal full day | 7:53 AM → 11:58 AM → 12:58 PM → 5:03 PM | IN, lunch, OUT | Regular Day |
| 2 | Normal day, no lunch scans | 7:53 AM → 5:03 PM | IN, OUT | Regular Day |
| 3 | Arrived, forgot OUT | 7:53 AM → 12:00 PM → 12:58 PM | IN + lunch, final OUT missing | Awaiting OUT |
| 4 | Single morning punch | 8:07 AM | Likely IN, no OUT | Single Punch — No OUT |
| 5 | Single evening punch | 5:20 PM | Could be OUT, but IN missing | Likely OUT — Missing IN |
| 6 | Half-day AM | 7:53 AM → 12:00 PM | Could be morning half-day departure | Possible Half Day — OUT |
| 7 | Half-day AM with lunch-like timing | 7:53 AM → 12:57 PM | Could be half-day departure OR lunch return | Needs context |
| 8 | Half-day PM | 12:55 PM → 5:03 PM | Could be PM arrival + OUT | Possible Half Day — PM |
| 9 | Late arrival | 10:15 AM → 5:04 PM | IN + OUT | Late / Regular Day |
| 10 | Early departure | 7:53 AM → 3:02 PM | IN + OUT before expected departure | Early OUT |
| 11 | Lunch only / unusual | 11:57 AM → 12:57 PM | Could be lunch scans, but no clear IN/OUT | Incomplete / Review |
| 12 | Duplicate scan | 7:53:24 → 7:53:27 → 7:53:30 AM | Same arrival scanned repeatedly | One primary IN + duplicates |
| 13 | Forgot IN, punched OUT | 5:20 PM only | Possible OUT, but no IN | Likely OUT — Missing IN |
| 14 | Forgot OUT, manual correction later | 7:53 AM → lunch scans | IN exists, OUT missing | Awaiting OUT → Manual Time |
| 15 | Official half-day | 7:53 AM → 12:05 PM | Could be half-day if HR/schedule says so | Half Day |
| 16 | Official leave | No punches | No biometric attendance expected | Leave / Absent, depending on approved record |
| 17 | Field work / official business | No OUT at office device | Employee may have left for work elsewhere | Requires approved record/context |
| 18 | Device/network failure | Employee claims attendance but device has no punch | Biometric data alone cannot prove it | Manual Time / Review |
