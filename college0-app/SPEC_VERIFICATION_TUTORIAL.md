# College0 — Specification verification tutorial

This document maps the **course project specification** (numbered requirements 1–10) to **what exists in this repo** and gives **step-by-step checks** you can perform in the running app (assume dev server at `http://localhost:5173/` unless you deploy elsewhere).

**Roles and URLs (after you have accounts):**

| Role        | Typical URL prefix |
|------------|---------------------|
| Public     | `/` (home)         |
| Login      | `/login`            |
| Registrar  | `/registrar/...`    |
| Instructor | `/instructor/...`   |
| Student    | `/student/...`     |
| Visitor    | `/visitor` (logged-in visitor role) |

**Accounts:** There is **no self-service sign-up page**. Students accepted by the registrar get credentials from the **Accept student** Edge flow (temporary password shown once). Instructors accepted still need an **Auth user** created in Supabase Dashboard (see §2). First registrar: see root [`README.md`](../README.md).

---

## 1. Public GUI: program introduction, highest-rated classes, lowest-rated classes, highest-GPA students

**Where it lives:** Home page is [`/`](../src/pages/PublicDashboard.tsx) (route `index` under `ShellLayout`).

### 1.1 General introduction of the program

1. Open `http://localhost:5173/` while **logged out** (or use a private window).
2. At the top you should see the title **College0** and paragraphs describing the graduate program, enrollment, instructors, registrar, and that the dashboard is public.
3. **Pass:** Intro text is visible without login. **Fail:** Blank page or error banner — check Supabase `v_public_dashboard_stats` view and RLS (anon should read the view).

### 1.2 Highest-rated classes

1. Stay on `/`. Scroll to **Program standings** → card **Highest-rated classes** (subtitle: average student rating).
2. Each row shows a **class label** (course code/title from the view) and a **numeric rating** (two decimal places typical).
3. **Pass:** List matches seeded/real review data (non-empty if you have reviews + `avg_rating` on classes). **Fail:** Always “No data yet” — add enrollments + reviews (student flow) or seed SQL.

### 1.3 Lowest-rated classes

1. Same section → card **Lowest-rated classes**.
2. **Pass:** Ordered so weaker averages appear (implementation uses `stat_type = 'bottom_class'` and ascending sort by rating in the UI).
3. **Fail:** Same as 1.2 if no data.

### 1.4 Students with highest GPA (public, anonymized)

1. Same section → card **Top GPA students** (subtitle mentions anonymized names).
2. Rows should show labels like **Student #1 (AB.)** — not necessarily full legal names (privacy-by-design for public leaderboard).
3. **Pass:** GPAs sort descending; labels are anonymized. **Fail:** Full names shown here — would contradict the intended public anonymization (check `anonymizedLabel` in `PublicDashboard.tsx`).

---

## 2. Visitor applications; registrar-only decisions; auto-accept rule; student id + password; first login; instructor applications

### 2.1 Visitor can apply to be a student

1. Log out. Go to **`/apply/student`** (or click **Apply as a student** on the home page).
2. Submit the form (name, email, prior GPA, etc.).
3. **Pass:** Success message or redirect; row appears in **Registrar → Applications** (`/registrar/applications`) as **pending** with role **student**.

### 2.2 Only the registrar can accept/reject

1. Log in as **registrar**. Open **`/registrar/applications`**.
2. Confirm pending applications list and **Accept / Reject** controls exist only for registrar (other roles cannot open this layout).
3. **Pass:** Non-registrar users cannot access `/registrar/*` (app gates with `RequireRole`).

### 2.3 Auto-accept rule (GPA > 3.0 and quota not reached) and justification overrides

1. On **`/registrar/applications`**, read the banner: **Active student quota** vs semester quota; rule text explains GPA > 3.0 + quota available ⇒ accept path requires justification when overriding.
2. **Accept a “must-accept” student without justification when rejecting** — UI should require justification (see `rejectApp` + `mustAcceptStudent`).
3. **Accept a student who does NOT meet auto-accept** — `acceptStudent` should require **Justification** before calling `accept-student-application` Edge function; Edge also enforces (see function source).
4. **Pass:** Buttons blocked with message until justification filled when rule demands it. **Fail:** Can bypass without text — bug.

### 2.4 Student id + temporary password; first login password change

1. Registrar accepts a student via **Accept** (Edge `accept-student-application`). A green panel shows **Email**, **Student ID** (`S-…`), **Temporary password**.
2. Log out. **`/login`** — sign in with that email + temp password.
3. You should be redirected to **`/first-login`**: forced **new password** (min length), then optional **tutorial** steps, then home by role.
4. **Pass:** Cannot reach main app until password updated and `first_login` cleared. **Fail:** Skips `/first-login` — check `ShellLayout` + `profiles.first_login`.

### 2.5 Instructor application (registrar free choice; no GPA/quota justification rule)

1. Visitor submits **`/apply/instructor`**.
2. Registrar opens **`/registrar/applications`**, uses **Accept instructor** (Edge Function **`accept-student-application`** — same deploy as student accept; creates Auth user + instructor profile).
3. **Pass:** Application status becomes accepted; UI shows **temporary password**; instructor can sign in (no manual Dashboard user creation).
4. After Auth user exists, registrar assigns classes from **Registrar → Instructors** → detail page.

---

## 3. Semester phases; setup; registration (2–4 courses, conflicts, capacity, waitlist, retake after F)

### 3.1 Four phases (managed by registrar)

1. Registrar: **`/registrar/semesters`** — create a semester (name, quota), observe **phase** (setup → registration → running → grading → closed) via **Advance phase** / similar controls (see `RegistrarSemestersPage.tsx` + RPC `rpc_transition_semester_phase`).
2. **Pass:** Only forward/back one step at a time per migration rules. **Fail:** Can skip phases — RPC bug.

### 3.2 Class setup period — classes, time, instructor, size

1. While semester is in **setup**, go to **`/registrar/classes`**. Create a class (semester, code, title, instructor, meeting days, time window, max students, optional map pin).
2. **Pass:** Class appears in list; schedule string readable. **Fail:** Cannot create in wrong phase if you add such checks (DB may still allow insert in any phase — product choice).

### 3.3 Registration — 2–4 courses, no time conflict, capacity / waitlist

1. Move semester to **registration** (`/registrar/semesters`).
2. Log in as **student**: **`/student/enroll`**.
3. Try enrolling in **more than four** classes in the same semester — server RPC `rpc_enroll_in_class` should refuse (UI may show message).
4. Enroll in two classes with **overlapping** meeting patterns — second should show conflict / error from RPC.
5. Fill a section to **max_students**, enroll another student — next should become **waitlisted** (button may still say Join waitlist).
6. **Pass:** Counts, waitlist, conflict messages match DB. **Fail:** Over-enrollment or conflicts allowed.

### 3.4 Retake only after an F

1. Ensure student has a **passed** grade for a course code in history; try to enroll same **course_code** again — should be blocked with reason (see `StudentEnrollPage` “Already passed”).
2. Give student an **F** in that course in DB or via grading; then retake should be allowed for a new section.
3. **Pass:** Retake rules enforced server-side as spec.

---

## 4. Running period; special registration; low-enrollment cancellation; warnings; instructor suspension

### 4.1 No registration during running (except special window)

1. Put semester in **running**. Student opens **`/student/enroll`**.
2. **Pass:** UI states registration closed; enroll buttons disabled unless `special_registration_eligible` on profile (cancellation flow).
3. If registrar marks student **special_registration_eligible** (DB or automation), student should enroll again during running.

### 4.2 Fewer than 2 courses — student warning

1. DB trigger / migration `20260513203000_under_enrollment_running_warning.sql` — during **running**, student with &lt; 2 active enrollments gets a **warning** issued.
2. **Verify:** Registrar or student profile shows increased `warning_count` / warnings table (inspect in Supabase Table Editor after moving phase and having one enrollment).

### 4.3 Course with &lt; 3 students cancelled; scan; special registration

1. Registrar: **`/registrar/scan`** — **Run scan** (`rpc_course_cancellation_scan`). JSON lists **cancelled** class ids.
2. Affected students should get **special_registration_eligible** (per migration logic).
3. **Pass:** Cancelled classes marked `is_cancelled`; eligible students can register per §4.1 exception.

### 4.4 Instructor warnings / suspension (all classes cancelled)

1. After cancellations, check **`/registrar/instructors`** and instructor profile / DB for **warnings** and **suspended** status per automation migrations (e.g. `20260513206000_spec_automation_honors_instructors.sql`).
2. **Pass:** Suspended instructor cannot teach next semester (enforced by triggers/RPCs — confirm with attempted assignment or enrollment rules).

---

## 5. Reviews (stars, anonymity to instructor, post-grade lock, low average warning, taboo words)

### 5.1 Student in class can review with 1–5 stars; summarized on class

1. Student: **`/student/reviews`** — pick enrolled class, stars, body, submit (Edge `submit-review` or RPC path per implementation).
2. Instructor: **`/instructor/reviews`** — sees **aggregated** / class reviews **without author identity** (code comment: author not selected).
3. Registrar: **`/registrar/overview`** — sees reviews joined to **author** (`author:profiles` in query) — only registrar-style visibility of who wrote what.
4. **Pass:** Instructor cannot see author; registrar can. **Fail:** Author leaked to instructor UI.

### 5.2 Cannot rate after grade posted

1. Instructor posts grade in **grading** phase (`/instructor/grading`). Student tries new review for that enrollment.
2. **Pass:** Insert denied by RLS/policy (`reviews_insert_student` checks grade is null). **Fail:** Review still allowed.

### 5.3 Average rating &lt; 2 ⇒ instructor warned

1. Seed several low-star reviews for one class; ensure `avg_rating` on `classes` updates (trigger from base schema).
2. Run phase scans / low-rating migration triggers — check **warnings** for instructor in DB or registrar UI.

### 5.4 Three instructor rating warnings ⇒ suspension

1. Documented in automation migration — verify by simulating three separate low-rating warn events (advanced).

### 5.5 Taboo words (registrar list)

1. Registrar: **`/registrar/taboo`** — add taboo words.
2. Student submits review with **1–2** taboo words → stored with **stars masked** in body (`filtered_body`), **1 warning** to author.
3. **≥ 3** taboo words → review **hidden** (`is_hidden`), **2 warnings**.
4. **Pass:** Edge `submit-review` + DB policies match. Inspect `reviews` rows.

---

## 6. Grading period; grades; instructor deadlines; class GPA band; student termination / warnings; honor roll; graduation (8 courses + required courses)

### 6.1 Instructors assign grades in grading period

1. Semester **grading**. Instructor **`/instructor/grading`** — assign letter grades per enrollment.
2. **Pass:** Outside grading phase, direct grade updates blocked for non-registrar (`enforce_grade_phase` trigger).

### 6.2 Missing grades after period — instructor warned

1. Leave some enrollments without grades; advance semester / run registrar automation (see **`/registrar/scan`** or overview tools if present).
2. **Pass:** Warning issued to instructor per migration.

### 6.3 Class GPA &gt; 3.5 or &lt; 2.5 — registrar questioning

1. Covered in automation / registrar workflows — verify via **`/registrar/overview`** metrics and follow-up warnings.

### 6.4 Student GPA &lt; 2 or same course failed twice ⇒ terminated

1. Adjust enrollments/grades in DB; run or wait for standing automation (`student_features` / later migrations).
2. **Pass:** `profiles.status` becomes **terminated** when rules hit.

### 6.5 GPA 2–2.25 ⇒ warning + interview demand

1. Similar — verify `warnings` row reason text and profile `warning_count`.

### 6.6 Honor roll (semester GPA &gt; 3.75 or cumulative &gt; 3.5) and honor removes one warning

1. After grades finalized, check **`profiles.honor_roll_count`**, `honor_awarded_cumulative_35`, and warning decrements per honor migration.
2. Student home may show honor copy — **`/student`**.

### 6.7 Graduation application (≥ 8 passing classes + required courses)

1. Student **`/student/graduation`** — page shows **passing course count**, **missing required** list, acknowledge checkbox, submit application.
2. Registrar approves/rejects in **`/registrar/graduation`** (RPC `rpc_decide_graduation_application`).
3. **Pass:** Premature application creates **warning** to student; approval sets **graduated** and locks account behavior per app.
4. **Note:** The written spec mentions a “Bachelor’s degree” label; the app models **graduate program** completion in prose and **`graduated`** status — treat naming as toy copy.

---

## 7. Complaints (student ↔ registrar, instructor ↔ registrar, fines, 3 warnings suspend one semester)

### 7.1 Student complains about student or instructor

1. Student: **`/student/complaints`** — file complaint, pick target type.
2. **Pass:** Row in `complaints` / status **open**.

### 7.2 Registrar processes complaints

1. Registrar: **`/registrar/complaints`** — resolve, issue warnings per investigation.

### 7.3 Instructor complains about student

1. Instructor: **`/instructor/complaints`** — registrar must act (per spec); verify registrar UI shows action paths.

### 7.4 Three warnings ⇒ one-semester suspension + fine

1. Use registrar **issue warning** flows / RPC `rpc_issue_warning` (see migrations) until three warnings.
2. **Pass:** Profile **suspended**, `fines` row with registrar as recipient context — confirm in Table Editor and student login blocked where applicable.

---

## 8. Post-login role dashboards (instructor roster, student records, tutorial, registrar sees all)

### 8.1 Instructor page — classes and student records

1. **`/instructor`** — class list; expand roster (GPA, warnings, grades when posted).
2. **`/instructor/waitlist`**, **`/instructor/grading`**, **`/instructor/profile`**.

### 8.2 Student page — own records

1. **`/student`**, **`/student/profile`**, **`/student/enroll`**, grades via enrollments.

### 8.3 New student tutorial

1. After first login password change, **`/first-login`** tutorial steps then navigate home.

### 8.4 Registrar sees everything

1. Explore **`/registrar`** sections: semesters, classes, applications, students, instructors, complaints, graduation, **overview**, taboo, scan.

### 8.5 Visitor browses basic directory

1. Log in as **visitor** (profile role visitor). **`/visitor`** — directory lists instructors/students and enrollment links **without grades** via `rpc_directory_enrollments`.

---

## 9. AI: local knowledge (RAG) + LLM fallback with hallucination warning

### 9.1 Visitor / general questions

1. **`/ai`** (logged out or any) — ask something in seeded `document_embeddings` vs not.
2. **Pass:** When no local context, UI shows **hallucination warning** and answer still returns (Edge `ai-chat`).

### 9.2 Student / instructor scoped context

1. **`/student/ai`**, **`/instructor/ai`** — session includes enrollment/roster context in Edge function.
2. **`CourseGeminiPanel`** on enroll / instructor class — sends optional `class_id` when allowed.

### 9.3 Deployment / keys

1. Edge secrets **`GEMINI_API_KEY`**; deploy **`ai-chat`**. See root README and `invokeEdge.ts` error messages if misconfigured.

---

## 10. Creative / enrichment features (team additions)

Document what this codebase adds beyond the baseline spec:

| Feature | Where to verify |
|--------|------------------|
| **Course map (pins)** | **`/class-locations`** public map; registrar **`/registrar/classes`** map picker; student/instructor class cards show map when lat/lng set. |
| **AI study groups** | Student **`/student/study-groups`** — pick class, run Edge **`study-groups`** (requires deploy + Gemini). |
| **Course locations in AI context** | Ask `ai-chat` with `class_id` from enrolled class (panel on enrollment page). |

**Pass:** Each page loads without crash; maps show OSM tiles; study-groups returns JSON or a clear Edge error if not deployed.

---

## Quick smoke checklist (all roles)

- [ ] `/` public dashboard three stat cards behave as §1  
- [ ] `/apply/student` + registrar accept + temp password + `/first-login` §2  
- [ ] `/apply/instructor` + accept + Dashboard Auth user + assign class §2  
- [ ] Phase transitions + enroll + waitlist + conflict §3  
- [ ] Running closed + special reg + cancellation scan §4  
- [ ] Reviews + taboo + anonymity §5  
- [ ] Grading + graduation §6  
- [ ] Complaints §7  
- [ ] Role dashboards §8  
- [ ] `/ai` + optional `/student/ai` §9  
- [ ] `/class-locations` + study groups §10  

---

*Generated for the College0 course project. Update this file if routes or RPC names change.*
