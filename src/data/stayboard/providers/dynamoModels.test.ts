import { matchesCondition } from "./dynamoModels";

describe("matchesCondition", () => {
  it("supports inclusive range operators used by dashboard queries", () => {
    const item = {
      checkInDate: "2026-06-02",
      checkOutDate: "2026-06-03",
      ownerId: "owner-1",
    };

    expect(
      matchesCondition(item, {
        ownerId: "owner-1",
        checkInDate: { $gte: "2026-06-01", $lte: "2026-06-30" },
      }),
    ).toBe(true);

    expect(
      matchesCondition(item, {
        checkInDate: { $lt: "2026-06-02" },
      }),
    ).toBe(false);

    expect(
      matchesCondition(item, {
        checkOutDate: { $gt: "2026-06-03" },
      }),
    ).toBe(false);
  });
});
