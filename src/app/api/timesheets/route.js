import sql from "@/app/api/utils/sql";
import { verifyToken } from "@/app/api/utils/auth";

export async function GET(request) {
  try {
    const user = await verifyToken(request);
    if (!user) {
      return Response.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const current = url.searchParams.get("current") === "true";
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = 50;
    const offset = (page - 1) * limit;

    let queryParts = [
      "SELECT t.*, j.title as job_title, c.name as client_name,",
      "u.first_name || ' ' || u.last_name as user_name",
      "FROM timesheets t",
      "LEFT JOIN jobs j ON t.job_id = j.id",
      "LEFT JOIN clients c ON t.client_id = c.id",
      "LEFT JOIN users u ON t.user_id = u.id",
      "WHERE 1=1",
    ];

    const params = [];
    let paramIndex = 1;

    // Role-based filtering
    if (user.role === "employee") {
      // Employees can only see their own timesheets
      queryParts.push(`AND t.user_id = $${paramIndex}`);
      params.push(user.id);
      paramIndex++;
    } else if (userId) {
      // Admin/Manager can filter by specific user
      queryParts.push(`AND t.user_id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    // If current=true, only get active (unclosed) timesheets
    if (current) {
      queryParts.push("AND t.clock_out_time IS NULL");
      if (user.role === "employee") {
        // For employees, ensure we only get their current timesheet
        queryParts.push(`AND t.user_id = $${paramIndex}`);
        params.push(user.id);
        paramIndex++;
      }
    }

    if (from) {
      queryParts.push(`AND t.clock_in_time >= $${paramIndex}`);
      params.push(from);
      paramIndex++;
    }

    if (to) {
      queryParts.push(`AND t.clock_in_time <= $${paramIndex}`);
      params.push(to);
      paramIndex++;
    }

    queryParts.push("ORDER BY t.clock_in_time DESC");

    if (!current) {
      queryParts.push(`LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`);
      params.push(limit, offset);
    } else {
      // For current timesheet, just get the most recent one
      queryParts.push("LIMIT 1");
    }

    const timesheets = await sql(queryParts.join(" "), params);

    return Response.json({
      timesheets: timesheets.map((t) => {
        const clockInTime = new Date(t.clock_in_time);
        const clockOutTime = t.clock_out_time
          ? new Date(t.clock_out_time)
          : null;
        const durationSec = clockOutTime
          ? Math.floor((clockOutTime - clockInTime) / 1000)
          : null;

        return {
          id: t.id,
          userId: t.user_id,
          userName: t.user_name,
          jobId: t.job_id,
          jobTitle: t.job_title,
          clientId: t.client_id,
          clientName: t.client_name,
          clockInTime: t.clock_in_time,
          clockInLoc:
            t.clock_in_location_lat && t.clock_in_location_lng
              ? {
                  lat: parseFloat(t.clock_in_location_lat),
                  lng: parseFloat(t.clock_in_location_lng),
                }
              : null,
          clockOutTime: t.clock_out_time,
          clockOutLoc:
            t.clock_out_location_lat && t.clock_out_location_lng
              ? {
                  lat: parseFloat(t.clock_out_location_lat),
                  lng: parseFloat(t.clock_out_location_lng),
                }
              : null,
          durationSec,
          status: t.clock_out_time ? "Closed" : "Open",
          surveyCompleted: t.survey_completed,
          notes: t.notes,
          breakDurationMinutes: t.break_duration_minutes || 0,
        };
      }),
    });
  } catch (error) {
    console.error("Error fetching timesheets:", error);
    return Response.json(
      { error: "Failed to fetch timesheets" },
      { status: 500 },
    );
  }
}
