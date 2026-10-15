import "server-only";
import { z } from "zod";
import { database } from "@engbot/core/db";
import { HttpError } from "@engbot/core/errors";
import { adminTables, type AdminData } from "./uzerz-schema";

const querySchema = z.object({
  table: z.string().max(30),
  query: z.string().trim().max(150).default(""),
  page: z.number().int().min(0).max(1000000).default(0),
  pageSize: z.union([z.literal(10), z.literal(25), z.literal(50)]).default(25),
  direction: z.enum(["newest", "oldest"]).default("newest"),
});

export async function readAdminData(body: unknown): Promise<AdminData> {
  const input = querySchema.parse(body);
  const table = adminTables.find((item) => item.key === input.table);
  if (!table) throw new HttpError(400, "Unknown table.");
  const { client: _client, ...collections } = await database();
  void _client;
  const collection = collections[table.key as keyof typeof collections];
  const escaped = input.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = escaped
    ? {
        $or: table.search.map((key) => ({
          [key]: { $regex: escaped, $options: "i" },
        })),
      }
    : {};
  const [totals, counts] = await Promise.all([
    collection
      .aggregate<{ total: number }>([{ $match: match }, { $count: "total" }], {
        maxTimeMS: 10000,
      })
      .toArray(),
    Promise.all(
      Object.entries(collections).map(
        async ([key, value]) =>
          [
            key,
            await value.estimatedDocumentCount({ maxTimeMS: 10000 }),
          ] as const,
      ),
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
        { $match: match },
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
