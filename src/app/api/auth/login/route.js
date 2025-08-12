import sql from "@/app/api/utils/sql";

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-key";

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return Response.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    // Get user from database
    const users = await sql`
      SELECT id, email, password_hash, role, first_name, last_name, employee_id, is_active
      FROM users 
      WHERE email = ${email.toLowerCase()}
    `;

    if (users.length === 0) {
      return Response.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    const user = users[0];

    if (!user.is_active) {
      return Response.json(
        { error: "Account is deactivated" },
        { status: 401 },
      );
    }

    // For demo purposes, accept multiple valid passwords for all users
    // In production, implement proper password hashing
    const validPasswords = [
      "Admin123!",
      "Admin123",
      "password1231",
      "password",
    ];
    const isValidPassword = validPasswords.includes(password);

    if (!isValidPassword) {
      return Response.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    // Create JWT token payload
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
    };

    // Simple JWT implementation (for demo - use proper library in production)
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payloadStr = btoa(JSON.stringify(payload));
    const token = `${header}.${payloadStr}.demo-signature`;

    // Save session to database
    const tokenHash = btoa(token).substring(0, 255);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await sql`
      INSERT INTO user_sessions (user_id, token_hash, expires_at)
      VALUES (${user.id}, ${tokenHash}, ${expiresAt})
    `;

    // Return user data (without password hash)
    const userData = {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
      employeeId: user.employee_id,
      fullName: `${user.first_name} ${user.last_name}`,
    };

    return Response.json({
      token,
      user: userData,
      message: "Login successful",
    });
  } catch (error) {
    console.error("Login error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
