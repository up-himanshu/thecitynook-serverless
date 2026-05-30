import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { StayboardDataModels } from "../repositories/types";

const TABLE_NAME = process.env.STAYBOARD_DYNAMO_TABLE;
const DYNAMO_ENDPOINT = process.env.STAYBOARD_DYNAMO_ENDPOINT;
const DYNAMO_REGION = DYNAMO_ENDPOINT
  ? "us-east-1"
  : process.env.STAYBOARD_AWS_REGION || process.env.AWS_REGION || "us-east-1";

const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: DYNAMO_REGION,
    endpoint: DYNAMO_ENDPOINT || undefined,
  }),
  {
    marshallOptions: {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    },
  },
);

type PlainRecord = Record<string, any>;

type SortDirection = 1 | -1;

const toId = () => randomBytes(12).toString("hex");

const isObject = (v: unknown): v is PlainRecord =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

const compareValue = (left: any, right: any): number => {
  if (left === right) return 0;
  if (left === undefined || left === null) return -1;
  if (right === undefined || right === null) return 1;
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right));
};

const matchesCondition = (item: PlainRecord, where: PlainRecord): boolean => {
  if (!where || !Object.keys(where).length) return true;

  for (const [key, expected] of Object.entries(where)) {
    if (key === "$or" && Array.isArray(expected)) {
      if (!expected.some((clause) => matchesCondition(item, clause)))
        return false;
      continue;
    }

    const actual = item[key];

    if (isObject(expected)) {
      for (const [op, opValue] of Object.entries(expected)) {
        if (op === "$ne") {
          if (actual === opValue) return false;
        } else if (op === "$gte") {
          if (!(actual >= opValue)) return false;
        } else if (op === "$in") {
          if (
            !Array.isArray(opValue) ||
            !opValue.some((v) => String(v) === String(actual))
          ) {
            return false;
          }
        } else if (op === "$nin") {
          if (
            Array.isArray(opValue) &&
            opValue.some((v) => String(v) === String(actual))
          ) {
            return false;
          }
        } else {
          if (actual !== (expected as any)[op]) return false;
        }
      }
      continue;
    }

    if (String(actual) !== String(expected)) return false;
  }

  return true;
};

const applyUpdateSpec = (
  current: PlainRecord,
  update: PlainRecord,
): PlainRecord => {
  const next = { ...current };

  if (update.$set && isObject(update.$set)) {
    Object.assign(next, update.$set);
  }

  for (const [key, value] of Object.entries(update)) {
    if (!key.startsWith("$")) next[key] = value;
  }

  return next;
};

class DynamoDoc {
  public _id: string;
  public createdAt?: string;
  public updatedAt?: string;
  protected __entity: string;

  constructor(entity: string, data: PlainRecord) {
    this.__entity = entity;
    this._id = String(data._id);
    Object.assign(this, data);
  }

  toObject() {
    const out: PlainRecord = {};
    for (const [k, v] of Object.entries(this)) {
      if (!k.startsWith("__")) out[k] = v;
    }
    return out;
  }

  async save() {
    const now = new Date().toISOString();
    const payload = this.toObject();
    if (!payload.createdAt) payload.createdAt = now;
    payload.updatedAt = now;

    if (
      this.__entity === "StayboardUser" &&
      payload.password &&
      !String(payload.password).startsWith("$2")
    ) {
      payload.password = await bcrypt.hash(String(payload.password), 10);
      (this as any).password = payload.password;
    }

    await dynamo.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `MODEL#${this.__entity}`,
          SK: this._id,
          entity: this.__entity,
          ...payload,
        },
      }),
    );

    Object.assign(this, payload);
    return this;
  }
}

class StayboardUserDoc extends DynamoDoc {
  async comparePassword(candidatePassword: string): Promise<boolean> {
    return bcrypt.compare(
      candidatePassword,
      String((this as any).password || ""),
    );
  }
}

class QueryChain<T = any> implements PromiseLike<T> {
  private readonly run: () => Promise<T>;

  constructor(run: () => Promise<T>) {
    this.run = run;
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.run().then(onfulfilled as any, onrejected as any);
  }
}

class FindManyChain<T = any[]> extends QueryChain<T> {
  private sortField: string | null = null;
  private sortDirection: SortDirection = 1;
  private limitCount: number | null = null;
  private selectSpec: string | null = null;

  constructor(loader: () => Promise<any[]>) {
    super(async () => {
      let rows = await loader();

      if (this.sortField) {
        const field = this.sortField;
        const direction = this.sortDirection;
        rows = [...rows].sort(
          (a, b) => compareValue(a[field], b[field]) * direction,
        );
      }

      if (typeof this.limitCount === "number") {
        rows = rows.slice(0, this.limitCount);
      }

      if (this.selectSpec) {
        rows = rows.map((row) => applySelect(row, this.selectSpec!));
      }

      return rows as T;
    });
  }

  sort(spec: PlainRecord) {
    const [field, direction] = Object.entries(spec)[0] || [];
    if (field) {
      this.sortField = field;
      this.sortDirection = Number(direction) === -1 ? -1 : 1;
    }
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  select(spec: string) {
    this.selectSpec = spec;
    return this;
  }
}

class FindOneChain<T = any> extends QueryChain<T | null> {
  private selectSpec: string | null = null;
  private sortField: string | null = null;
  private sortDirection: SortDirection = 1;

  constructor(loader: () => Promise<any[]>) {
    super(async () => {
      let rows = await loader();
      if (this.sortField) {
        const field = this.sortField;
        const direction = this.sortDirection;
        rows = [...rows].sort(
          (a, b) => compareValue(a[field], b[field]) * direction,
        );
      }
      const row = rows[0];
      if (!row) return null;
      return this.selectSpec ? applySelect(row, this.selectSpec) : row;
    });
  }

  select(spec: string) {
    this.selectSpec = spec;
    return this;
  }

  sort(spec: PlainRecord) {
    const [field, direction] = Object.entries(spec)[0] || [];
    if (field) {
      this.sortField = field;
      this.sortDirection = Number(direction) === -1 ? -1 : 1;
    }
    return this;
  }
}

const applySelect = (row: any, spec: string) => {
  const fields = spec
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (!fields.length) return row;

  const exclude = fields.every((f) => f.startsWith("-"));
  const base = row.toObject ? row.toObject() : { ...row };

  if (exclude) {
    for (const f of fields) {
      delete base[f.replace(/^-/, "")];
    }
    return base;
  }

  const picked: PlainRecord = {};
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(base, f)) picked[f] = base[f];
  }
  return picked;
};

const makeDoc = (entity: string, item: PlainRecord): any => {
  const data = { ...item };
  delete data.PK;
  delete data.SK;
  delete data.entity;

  if (entity === "StayboardUser") return new StayboardUserDoc(entity, data);
  return new DynamoDoc(entity, data);
};

const readAllEntityItems = async (entity: string): Promise<any[]> => {
  const out: any[] = [];
  let cursor: PlainRecord | undefined;

  do {
    const resp = await dynamo.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `MODEL#${entity}`,
        },
        ExclusiveStartKey: cursor,
      }),
    );

    const items = (resp.Items || []).map((x) => makeDoc(entity, x));
    out.push(...items);
    cursor = resp.LastEvaluatedKey as PlainRecord | undefined;
  } while (cursor);

  return out;
};

const createModel = (entity: string) => {
  const model = {
    find(where: PlainRecord = {}) {
      return new FindManyChain(async () => {
        const all = await readAllEntityItems(entity);
        return all.filter((doc) => matchesCondition(doc.toObject(), where));
      });
    },

    async create(payload: PlainRecord) {
      const now = new Date().toISOString();
      const doc = makeDoc(entity, {
        _id: payload._id || toId(),
        createdAt: now,
        updatedAt: now,
        ...payload,
      });

      await doc.save();
      return doc;
    },

    findOne(where: PlainRecord = {}) {
      return new FindOneChain(async () => {
        const all = await readAllEntityItems(entity);
        return all.filter((doc) => matchesCondition(doc.toObject(), where));
      });
    },

    findById(id: string) {
      return new FindOneChain(async () => {
        if (!id) return [];
        const resp = await dynamo.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `MODEL#${entity}`,
              SK: String(id),
            },
          }),
        );
        if (!resp.Item) return [];
        return [makeDoc(entity, resp.Item)];
      });
    },

    async updateOne(
      where: PlainRecord,
      update: PlainRecord,
      options: PlainRecord = {},
    ) {
      const existing = await model.findOne(where);
      if (!existing) {
        if (options.upsert) {
          const seed = applyUpdateSpec(where, update);
          await model.create(seed);
          return {
            acknowledged: true,
            matchedCount: 0,
            modifiedCount: 0,
            upsertedCount: 1,
          };
        }
        return {
          acknowledged: true,
          matchedCount: 0,
          modifiedCount: 0,
          upsertedCount: 0,
        };
      }

      const current = existing.toObject ? existing.toObject() : existing;
      const next = applyUpdateSpec(current, update);
      next.updatedAt = new Date().toISOString();

      await dynamo.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `MODEL#${entity}`,
            SK: String(current._id),
            entity,
            ...next,
          },
        }),
      );

      return {
        acknowledged: true,
        matchedCount: 1,
        modifiedCount: 1,
        upsertedCount: 0,
      };
    },

    async findOneAndUpdate(
      where: PlainRecord,
      update: PlainRecord,
      options: PlainRecord = {},
    ) {
      const existing = await model.findOne(where);
      if (!existing) {
        if (options.upsert) {
          const created = await model.create(applyUpdateSpec(where, update));
          return options.new ? created : null;
        }
        return null;
      }

      const current = existing.toObject ? existing.toObject() : existing;
      const next = applyUpdateSpec(current, update);
      next.updatedAt = new Date().toISOString();

      await dynamo.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `MODEL#${entity}`,
            SK: String(current._id),
            entity,
            ...next,
          },
        }),
      );

      return options.new ? makeDoc(entity, next) : existing;
    },

    async updateMany(where: PlainRecord, update: PlainRecord) {
      const matches = await model.find(where);
      let modifiedCount = 0;

      for (const row of matches) {
        const current = row.toObject ? row.toObject() : row;
        const next = applyUpdateSpec(current, update);
        next.updatedAt = new Date().toISOString();

        await dynamo.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: `MODEL#${entity}`,
              SK: String(current._id),
              entity,
              ...next,
            },
          }),
        );
        modifiedCount += 1;
      }

      return {
        acknowledged: true,
        matchedCount: matches.length,
        modifiedCount,
      };
    },

    async countDocuments(where: PlainRecord = {}) {
      const matches = await model.find(where);
      return matches.length;
    },

    async deleteOne(where: PlainRecord) {
      const existing = await model.findOne(where);
      if (!existing) return { acknowledged: true, deletedCount: 0 };

      await dynamo.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `MODEL#${entity}`,
            SK: String(existing._id),
          },
        }),
      );
      return { acknowledged: true, deletedCount: 1 };
    },

    async deleteMany(where: PlainRecord) {
      const matches = await model.find(where);
      let deletedCount = 0;
      for (const row of matches) {
        await dynamo.send(
          new DeleteCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `MODEL#${entity}`,
              SK: String(row._id),
            },
          }),
        );
        deletedCount += 1;
      }
      return { acknowledged: true, deletedCount };
    },
  };

  return model;
};

export const dynamoStayboardModels = {
  User: createModel("StayboardUser"),
  Listing: createModel("StayboardListing"),
  Booking: createModel("StayboardBooking"),
  HousekeepingTask: createModel("StayboardHousekeepingTask"),
  Device: createModel("StayboardDevice"),
} as unknown as StayboardDataModels;
