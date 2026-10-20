import "server-only";
import { z } from "zod";
import type { Document } from "mongodb";
import { database } from "@engbot/core/db";
import { HttpError } from "@engbot/core/errors";
import { adminDateSchema, adminTables, type AdminData } from "./uzerz-schema";

const querySchema = z.object({
  table: z.string().max(30),
  query: z.string().trim().max(150).default(""),
  page: z.number().int().min(0).max(1000000).default(0),
  pageSize: z.union([z.literal(10), z.literal(25), z.literal(50)]).default(25),
  direction: z.enum(["newest", "oldest"]).default("newest"),
  dateFrom: adminDateSchema.default(""),
  dateTo: adminDateSchema.default(""),
});

export async function readAdminData(body: unknown): Promise<AdminData> {
  const input = querySchema.parse(body);
  const table = adminTables.find((item) => item.key === input.table);
  if (!table) throw new HttpError(400, "Unknown table.");
  if (table.key === "analytics") return readAnalytics(input);
  const hasDateFilter =
    table.key === "trialUsage" && Boolean(input.dateFrom || input.dateTo);
  if (
    hasDateFilter &&
    input.dateFrom &&
    input.dateTo &&
    input.dateFrom > input.dateTo
  )
    throw new HttpError(
      400,
      "The end date must be on or after the start date.",
    );
  const midnight = (date: string) => ({
    $dateFromString: { dateString: date, timezone: "Europe/Kyiv" },
  });
  const messageDates: Document[] = [];
  if (input.dateFrom)
    messageDates.push({ $gte: ["$createdAt", midnight(input.dateFrom)] });
  if (input.dateTo)
    messageDates.push({
      $lt: [
        "$createdAt",
        {
          $dateAdd: {
            startDate: midnight(input.dateTo),
            unit: "day",
            amount: 1,
            timezone: "Europe/Kyiv",
          },
        },
      ],
    });
  const { client: _client, ...collections } = await database();
  void _client;
  const collection = collections[table.key as keyof typeof collections];
  const prepare: Document[] =
    table.key === "trialUsage"
      ? [
          {
            $group: {
              _id: { $arrayElemAt: [{ $split: ["$_id", ":"] }, 0] },
            },
          },
          { $set: { userId: "$_id" } },
          {
            $lookup: {
              from: "users",
              localField: "userId",
              foreignField: "_id",
              pipeline: [{ $project: { name: 1, username: 1 } }],
              as: "user",
            },
          },
          { $set: { user: { $arrayElemAt: ["$user", 0] } } },
          {
            $set: {
              name: "$user.name",
              username: {
                $cond: [
                  { $ifNull: ["$user.username", false] },
                  { $concat: ["@", "$user.username"] },
                  { $ifNull: ["$user.name", "$userId"] },
                ],
              },
            },
          },
        ]
      : [];
  const escaped = input.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = escaped
    ? {
        $or: table.search.map((key) => ({
          [key]: { $regex: escaped, $options: "i" },
        })),
      }
    : {};
  // Aggregate saved messages before counting/paging so date filters, totals and
  // ordering all describe the same users and the same period.
  const messages: Document[] =
    table.key === "trialUsage"
      ? [
          {
            $lookup: {
              from: "messages",
              localField: "userId",
              foreignField: "userId",
              pipeline: [
                ...(hasDateFilter
                  ? [{ $match: { $expr: { $and: messageDates } } }]
                  : []),
                {
                  $group: {
                    _id: null,
                    total: { $sum: 1 },
                    lastMessageAt: { $max: "$createdAt" },
                  },
                },
              ],
              as: "messageStats",
            },
          },
          {
            $set: {
              totalMessages: {
                $ifNull: [{ $arrayElemAt: ["$messageStats.total", 0] }, 0],
              },
              lastMessageAt: {
                $ifNull: [
                  { $arrayElemAt: ["$messageStats.lastMessageAt", 0] },
                  null,
                ],
              },
            },
          },
          { $set: { sortAt: "$lastMessageAt" } },
          ...(hasDateFilter ? [{ $match: { totalMessages: { $gt: 0 } } }] : []),
        ]
      : [];
  const filtered = [...prepare, { $match: match }, ...messages];
  const [totals, counts] = await Promise.all([
    collection
      .aggregate<{ total: number }>([...filtered, { $count: "total" }], {
        maxTimeMS: 10000,
      })
      .toArray(),
    Promise.all(
      Object.entries(collections).map(async ([key, value]) => {
        if (key === "trialUsage") {
          const result = await value
            .aggregate<{ total: number }>(
              [
                {
                  $group: {
                    _id: { $arrayElemAt: [{ $split: ["$_id", ":"] }, 0] },
                  },
                },
                { $count: "total" },
              ],
              { maxTimeMS: 10000 },
            )
            .toArray();
          return [key, result[0]?.total || 0] as const;
        }
        return [
          key,
          await value.estimatedDocumentCount({ maxTimeMS: 10000 }),
        ] as const;
      }),
    ),
  ]);
  const total = totals[0]?.total || 0;
  const page = Math.min(
    input.page,
    Math.max(0, Math.ceil(total / input.pageSize) - 1),
  );
  const direction = input.direction === "oldest" ? 1 : -1;
  const rows = await collection
    .aggregate<Record<string, unknown>>(
      [
        ...filtered,
        { $sort: { [table.sort]: direction, _id: direction } },
        { $skip: page * input.pageSize },
        { $limit: input.pageSize },
        {
          $project: Object.fromEntries(
            table.columns.map((column) => [column.key, 1]),
          ),
        },
      ],
      { maxTimeMS: 10000 },
    )
    .toArray();
  return {
    rows: rows.map((row) =>
      Object.fromEntries(
        table.columns.map(({ key }) => {
          const value = key
            .split(".")
            .reduce<unknown>(
              (parent, part) =>
                parent && typeof parent === "object"
                  ? (parent as Record<string, unknown>)[part]
                  : undefined,
              row,
            );
          return [
            key,
            value == null
              ? null
              : value instanceof Date
                ? value.toISOString()
                : typeof value === "object"
                  ? JSON.stringify(value, null, 2)
                  : String(value),
          ];
        }),
      ),
    ),
    total,
    page,
    pageSize: input.pageSize,
    counts: Object.fromEntries(counts),
  };
}

async function readAnalytics(
  input: z.infer<typeof querySchema>,
): Promise<AdminData> {
  const { users, messages } = await database();
  const timezone = "Europe/Kyiv";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const shiftDay = (day: string, amount: number) => {
    const date = new Date(`${day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  };
  const firstDay = shiftDay(today, -31);
  const [onboarded, totals, activity] = await Promise.all([
    users.countDocuments(
      { settings: { $exists: true, $ne: null } },
      { maxTimeMS: 10000 },
    ),
    messages
      .aggregate<{ messaged: number; elevenPlus: number }>(
        [
          { $group: { _id: "$userId", count: { $sum: 1 } } },
          {
            $group: {
              _id: null,
              messaged: { $sum: 1 },
              elevenPlus: { $sum: { $cond: [{ $gte: ["$count", 11] }, 1, 0] } },
            },
          },
        ],
        { maxTimeMS: 10000 },
      )
      .toArray(),
    messages
      .aggregate<{ _id: string; active: number; returned: number }>(
        [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $gte: [
                      "$createdAt",
                      { $dateFromString: { dateString: firstDay, timezone } },
                    ],
                  },
                  {
                    $lt: [
                      "$createdAt",
                      { $dateFromString: { dateString: today, timezone } },
                    ],
                  },
                ],
              },
            },
          },
          {
            $group: {
              _id: "$userId",
              days: {
                $addToSet: {
                  $dateToString: {
                    date: "$createdAt",
                    format: "%Y-%m-%d",
                    timezone,
                  },
                },
              },
            },
          },
          { $project: { days: 1, day: "$days" } },
          { $unwind: "$day" },
          {
            $group: {
              _id: "$day",
              active: { $sum: 1 },
              returned: {
                $sum: {
                  $cond: [
                    {
                      $in: [
                        {
                          $dateToString: {
                            format: "%Y-%m-%d",
                            timezone,
                            date: {
                              $dateSubtract: {
                                startDate: {
                                  $dateFromString: {
                                    dateString: "$day",
                                    timezone,
                                  },
                                },
                                unit: "day",
                                amount: 1,
                                timezone,
                              },
                            },
                          },
                        },
                        "$days",
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ],
        { maxTimeMS: 10000 },
      )
      .toArray(),
  ]);
  const byDay = new Map(activity.map((row) => [row._id, row]));
  const rows = Array.from({ length: 30 }, (_, index) => {
    const day = shiftDay(today, index - 30);
    const previousActive = byDay.get(shiftDay(day, -1))?.active ?? 0;
    const current = byDay.get(day);
    const returned = current?.returned ?? 0;
    return {
      day,
      previousActive: String(previousActive),
      active: String(current?.active ?? 0),
      returned: String(returned),
      retention: previousActive
        ? new Intl.NumberFormat("en-US", {
            style: "percent",
            maximumFractionDigits: 1,
          }).format(returned / previousActive)
        : null,
    };
  });
  if (input.direction === "newest") rows.reverse();
  const page = Math.min(
    input.page,
    Math.ceil(rows.length / input.pageSize) - 1,
  );
  return {
    rows: rows.slice(page * input.pageSize, (page + 1) * input.pageSize),
    total: rows.length,
    page,
    pageSize: input.pageSize,
    counts: {},
    analytics: {
      onboarded,
      messaged: totals[0]?.messaged ?? 0,
      elevenPlus: totals[0]?.elevenPlus ?? 0,
    },
  };
}
