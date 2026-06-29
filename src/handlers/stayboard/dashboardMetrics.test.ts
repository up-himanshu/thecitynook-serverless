import moment from "moment";
import { buildDashboardPayload } from "./dashboardMetrics";

describe("buildDashboardPayload", () => {
  it("counts only bookings within the month-to-date window and excludes late-May carryovers", () => {
    const now = moment("2026-06-28", "YYYY-MM-DD", true);

    const bookings = [
      {
        _id: "b1",
        listingId: "802",
        checkInDate: "2026-06-01",
        checkOutDate: "2026-06-02",
        nights: 1,
        amount: 30000,
      },
      {
        _id: "b2",
        listingId: "802",
        checkInDate: "2026-06-02",
        checkOutDate: "2026-06-03",
        nights: 1,
        amount: 25000,
      },
      {
        _id: "b3",
        listingId: "802",
        checkInDate: "2026-06-05",
        checkOutDate: "2026-06-06",
        nights: 1,
        amount: 20000,
      },
      {
        _id: "b4",
        listingId: "802",
        checkInDate: "2026-06-07",
        checkOutDate: "2026-06-08",
        nights: 1,
        amount: 15000,
      },
      {
        _id: "b5",
        listingId: "401",
        checkInDate: "2026-06-10",
        checkOutDate: "2026-06-12",
        nights: 2,
        amount: 50000,
      },
      {
        _id: "b6",
        listingId: "401",
        checkInDate: "2026-06-13",
        checkOutDate: "2026-06-14",
        nights: 1,
        amount: 10000,
      },
      {
        _id: "b7",
        listingId: "401",
        checkInDate: "2026-06-15",
        checkOutDate: "2026-06-18",
        nights: 3,
        amount: 45000,
      },
      {
        _id: "b8",
        listingId: "401",
        checkInDate: "2026-06-20",
        checkOutDate: "2026-06-21",
        nights: 1,
        amount: 15620,
      },
      {
        _id: "p1",
        listingId: "802",
        checkInDate: "2026-05-01",
        checkOutDate: "2026-05-02",
        nights: 1,
        amount: 2000,
      },
      {
        _id: "p2",
        listingId: "401",
        checkInDate: "2026-05-01",
        checkOutDate: "2026-05-02",
        nights: 1,
        amount: 4800,
      },
      {
        _id: "p3",
        listingId: "401",
        checkInDate: "2026-05-31",
        checkOutDate: "2026-06-01",
        nights: 1,
        amount: 1250,
      },
      {
        _id: "p4",
        listingId: "802",
        checkInDate: "2026-05-30",
        checkOutDate: "2026-06-03",
        nights: 4,
        amount: 1400,
      },
    ];

    const payload = buildDashboardPayload({
      bookings: bookings as any,
      tasks: [],
      listings: [
        { _id: "802", name: "802" },
        { _id: "401", name: "401" },
      ],
      now,
    });

    expect(payload.month).toEqual({
      bookings: 8,
      roomNights: 11,
      revenue: 210620,
    });
    expect(payload.changePastMonth).toMatchObject({
      previousRevenue: 6800,
      diff: 203820,
    });
  });

  it("accepts ISO timestamp-like booking dates without dropping them", () => {
    const now = moment("2026-06-28", "YYYY-MM-DD", true);

    const payload = buildDashboardPayload({
      bookings: [
        {
          _id: "iso-1",
          listingId: "802",
          checkInDate: "2026-06-01T00:00:00.000Z",
          checkOutDate: "2026-06-03T00:00:00.000Z",
          nights: 2,
          amount: 1000,
        },
      ] as any,
      tasks: [],
      listings: [{ _id: "802", name: "802" }],
      now,
    });

    expect(payload.month).toEqual({
      bookings: 1,
      roomNights: 2,
      revenue: 1000,
    });
  });

  it("ignores bookings for inactive listings when an allowlist is provided", () => {
    const now = moment("2026-06-28", "YYYY-MM-DD", true);

    const payload = buildDashboardPayload({
      bookings: [
        {
          _id: "live",
          listingId: "802",
          checkInDate: "2026-06-01",
          checkOutDate: "2026-06-02",
          nights: 1,
          amount: 5000,
        },
        {
          _id: "inactive",
          listingId: "deleted-listing",
          checkInDate: "2026-06-01",
          checkOutDate: "2026-06-02",
          nights: 1,
          amount: 9999,
        },
      ] as any,
      tasks: [],
      listings: [{ _id: "802", name: "802" }],
      allowedListingIds: ["802"],
      now,
    });

    expect(payload.month).toEqual({
      bookings: 1,
      roomNights: 1,
      revenue: 5000,
    });
    expect(payload.changePastMonth.previousRevenue).toBe(0);
  });
});
