

const FriendSystem = (function () {

  function emailKey(email) {
    return String(email || "").replace(/[.#$[\]]/g, "_");
  }

  function getDb() {
    try {
      if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length) {
        return firebase.firestore();
      }
    } catch {}
    return null;
  }

  // ── Send a friend request ────────────────────────────────────────────────
  async function sendRequest(fromEmail, toEmail) {
    const db = getDb();
    if (!db) throw new Error("Firebase not available");
    const id = [emailKey(fromEmail), emailKey(toEmail)].sort().join("__");
    const ref = db.collection("friendRequests").doc(id);
    const snap = await ref.get();
    if (snap.exists) {
      const data = snap.data();
      if (data.status === "accepted") throw new Error("already_friends");
      if (data.status === "pending") throw new Error("already_sent");
    }
    await ref.set({
      from: fromEmail,
      to: toEmail,
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // Create notification for recipient
    await db.collection("notifications").add({
      to: toEmail,
      from: fromEmail,
      type: "friend_request",
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  // ── Accept a friend request ──────────────────────────────────────────────
  async function acceptRequest(fromEmail, meEmail) {
    const db = getDb();
    if (!db) throw new Error("Firebase not available");
    const id = [emailKey(fromEmail), emailKey(meEmail)].sort().join("__");
    const ref = db.collection("friendRequests").doc(id);
    await ref.update({ status: "accepted" });

    // Add each to the other's friends list
    const batch = db.batch();
    batch.set(db.collection("friends").doc(emailKey(meEmail)), {
      friends: firebase.firestore.FieldValue.arrayUnion(fromEmail),
    }, { merge: true });
    batch.set(db.collection("friends").doc(emailKey(fromEmail)), {
      friends: firebase.firestore.FieldValue.arrayUnion(meEmail),
    }, { merge: true });
    await batch.commit();

    // Notification for the requester
    await db.collection("notifications").add({
      to: fromEmail,
      from: meEmail,
      type: "friend_accepted",
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  // ── Decline a friend request ─────────────────────────────────────────────
  async function declineRequest(fromEmail, meEmail) {
    const db = getDb();
    if (!db) throw new Error("Firebase not available");
    const id = [emailKey(fromEmail), emailKey(meEmail)].sort().join("__");
    await db.collection("friendRequests").doc(id).update({ status: "declined" });
  }

  // ── Unfriend ─────────────────────────────────────────────────────────────
  async function unfriend(myEmail, theirEmail) {
    const db = getDb();
    if (!db) throw new Error("Firebase not available");
    const id = [emailKey(myEmail), emailKey(theirEmail)].sort().join("__");
    const batch = db.batch();
    batch.delete(db.collection("friendRequests").doc(id));
    batch.set(db.collection("friends").doc(emailKey(myEmail)), {
      friends: firebase.firestore.FieldValue.arrayRemove(theirEmail),
    }, { merge: true });
    batch.set(db.collection("friends").doc(emailKey(theirEmail)), {
      friends: firebase.firestore.FieldValue.arrayRemove(myEmail),
    }, { merge: true });
    await batch.commit();
  }

  // ── Get relationship status between two users ────────────────────────────
  // Returns: "self" | "friends" | "request_sent" | "request_received" | "none"
  async function getStatus(myEmail, theirEmail) {
    if (myEmail === theirEmail) return "self";
    const db = getDb();
    if (!db) return "none";
    const id = [emailKey(myEmail), emailKey(theirEmail)].sort().join("__");
    const snap = await db.collection("friendRequests").doc(id).get();
    if (!snap.exists) return "none";
    const data = snap.data();
    if (data.status === "accepted") return "friends";
    if (data.status === "pending") {
      return data.from === myEmail ? "request_sent" : "request_received";
    }
    return "none";
  }

  // ── Get a user's friends list ────────────────────────────────────────────
  async function getFriends(email) {
    const db = getDb();
    if (!db) return [];
    const snap = await db.collection("friends").doc(emailKey(email)).get();
    return snap.exists ? (snap.data().friends || []) : [];
  }

  // ── Get pending incoming requests ────────────────────────────────────────
  async function getPendingRequests(meEmail) {
    const db = getDb();
    if (!db) return [];
    const snap = await db.collection("friendRequests")
      .where("to", "==", meEmail)
      .where("status", "==", "pending")
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  // ── Get unread notification count ────────────────────────────────────────
  async function getUnreadCount(meEmail) {
    const db = getDb();
    if (!db) return 0;
    // Get all notifications and filter in JS to avoid composite index
    const snap = await db.collection("notifications")
      .where("to", "==", meEmail)
      .get();
    return snap.docs.filter(d => d.data().read === false).length;
  }

  // ── Mark all notifications as read ───────────────────────────────────────
  async function markNotificationsRead(meEmail) {
    const db = getDb();
    if (!db) return;
    const snap = await db.collection("notifications")
      .where("to", "==", meEmail)
      .get();
    const unread = snap.docs.filter(d => d.data().read === false);
    if (!unread.length) return;
    const batch = db.batch();
    unread.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
  }

  // ── Get all notifications ────────────────────────────────────────────────
  async function getNotifications(meEmail) {
    const db = getDb();
    if (!db) return [];
    // No orderBy to avoid composite index requirement — sort manually
    const snap = await db.collection("notifications")
      .where("to", "==", meEmail)
      .limit(50)
      .get();
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Sort newest first manually
    docs.sort((a, b) => {
      const ta = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
      const tb = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
      return tb - ta;
    });
    return docs;
  }

  return {
    sendRequest,
    acceptRequest,
    declineRequest,
    unfriend,
    getStatus,
    getFriends,
    getPendingRequests,
    getUnreadCount,
    markNotificationsRead,
    getNotifications,
  };
})();
