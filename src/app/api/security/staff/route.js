
import { NextResponse } from "next/server";
import { auth, db } from "@/lib/firebase";

export const runtime = "nodejs";

export async function PATCH(request) {
  try {
    // Verify the admin's Firebase ID token.
    const authorization = request.headers.get("authorization") || "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const decoded = await adminAuth.verifyIdToken(match[1]);

    // Confirm the requester is an active admin.
    const adminSnapshot = await adminDb
      .collection("users")
      .doc(decoded.uid)
      .get();

    const adminData = adminSnapshot.data();

    if (
      !adminSnapshot.exists ||
      adminData?.role !== "admin" ||
      adminData?.active !== true
    ) {
      return NextResponse.json(
        { error: "Only active administrators can manage staff." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const uid = String(body.uid || "").trim();
    const active = body.active;

    if (!uid || typeof active !== "boolean") {
      return NextResponse.json(
        { error: "A staff UID and active status are required." },
        { status: 400 }
      );
    }

    if (uid === decoded.uid) {
      return NextResponse.json(
        { error: "You cannot change your own admin status here." },
        { status: 400 }
      );
    }

    // Only security staff can be changed through this endpoint.
    const staffRef = adminDb.collection("users").doc(uid);
    const staffSnapshot = await staffRef.get();

    if (
      !staffSnapshot.exists ||
      staffSnapshot.data()?.role !== "security"
    ) {
      return NextResponse.json(
        { error: "Security staff account not found." },
        { status: 404 }
      );
    }

    const previousActive = staffSnapshot.data().active === true;

    // If the status is already correct, still ensure Auth matches.
    if (previousActive === active) {
      await adminAuth.updateUser(uid, { disabled: !active });

      return NextResponse.json({
        success: true,
        active,
        message: active
          ? "Security staff is on duty."
          : "Security staff is off duty.",
      });
    }

    // Update Firestore first so your app's security rules see the new status.
    await staffRef.update({
      active,
      dutyStatus: active ? "on-duty" : "no-duty",
      ...(active
        ? {
            returnedToDutyAt: new Date(),
            returnedToDutyBy: decoded.uid,
          }
        : {
            deactivatedAt: new Date(),
            deactivatedBy: decoded.uid,
          }),
    });

    try {
      // On duty = enabled sign-in. No duty = disabled sign-in.
      await adminAuth.updateUser(uid, { disabled: !active });
    } catch (authError) {
      console.error("Could not update security account:", authError);

      // Restore the previous active status if Auth update fails.
      try {
        await staffRef.update({
          active: previousActive,
          dutyStatus: previousActive ? "on-duty" : "no-duty",
        });
      } catch (rollbackError) {
        console.error("Status rollback failed:", rollbackError);
      }

      return NextResponse.json(
        { error: "Could not update the staff member's sign-in status." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      active,
      message: active
        ? "Security staff has been returned to duty."
        : "Security staff has been removed from duty.",
    });
  } catch (error) {
    console.error("Security duty update failed:", error);

    return NextResponse.json(
      { error: "Unable to update security staff duty status." },
      { status: 500 }
    );
  }
}
