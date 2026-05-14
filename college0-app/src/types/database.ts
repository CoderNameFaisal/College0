export type UserRole = 'registrar' | 'instructor' | 'student' | 'visitor'
export type ProfileStatus = 'active' | 'suspended' | 'terminated' | 'graduated'
export type SemesterPhase =
  | 'setup'
  | 'registration'
  | 'running'
  | 'grading'
  | 'closed'
export type EnrollmentStatus = 'enrolled' | 'waitlisted' | 'dropped'
export type GradeLetter = 'A' | 'B' | 'C' | 'D' | 'F'
export type AppRoleRequested = 'student' | 'instructor'
export type AppStatus = 'pending' | 'accepted' | 'rejected'
export type ComplaintStatus = 'open' | 'resolved'
export type GradAppStatus = 'pending' | 'approved' | 'rejected'

export type ProfileRow = {
  id: string
  role: UserRole
  full_name: string
  student_id: string | null
  status: ProfileStatus
  warning_count: number
  cumulative_gpa: number | null
  honor_roll_count: number
  honor_awarded_cumulative_35: boolean
  first_login: boolean
  special_registration_eligible: boolean
  created_at: string
  updated_at: string
}

export type Database = {
  public: {
    Tables: {
      profiles: { Row: ProfileRow; Insert: Partial<ProfileRow> & { id: string }; Update: Partial<ProfileRow> }
      semesters: {
        Row: {
          id: string
          name: string
          phase: SemesterPhase
          quota: number
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      classes: {
        Row: {
          id: string
          semester_id: string
          course_code: string
          title: string
          instructor_id: string | null
          schedule_time: string
          course_start_date: string
          course_end_date: string
          meeting_days: number[]
          period_start: string
          period_end: string
          max_students: number
          avg_rating: number | null
          is_cancelled: boolean
          location_lat: number | null
          location_lng: number | null
          location_label: string | null
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      enrollments: {
        Row: {
          id: string
          student_id: string
          class_id: string
          semester_id: string
          status: EnrollmentStatus
          grade: GradeLetter | null
          enrolled_at: string
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      warnings: {
        Row: {
          id: string
          target_id: string
          reason: string
          issued_by: string | null
          semester_id: string | null
          is_removed: boolean
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      fines: {
        Row: {
          id: string
          student_id: string
          amount: number
          reason: string
          semester_id: string | null
          paid: boolean
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      required_courses: {
        Row: {
          course_code: string
          title: string
          created_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      applications: {
        Row: {
          id: string
          applicant_email: string
          applicant_name: string | null
          qualifications: string | null
          role_requested: AppRoleRequested
          prior_gpa: number | null
          status: AppStatus
          rejection_reason: string | null
          reviewed_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      reviews: {
        Row: {
          id: string
          class_id: string
          author_id: string
          stars: number
          body: string
          filtered_body: string | null
          is_hidden: boolean
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      complaints: {
        Row: {
          id: string
          filed_by: string
          against: string
          description: string
          resolution: string | null
          status: ComplaintStatus
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      taboo_words: {
        Row: {
          id: string
          word: string
          added_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      graduation_applications: {
        Row: {
          id: string
          student_id: string
          semester_id: string
          status: GradAppStatus
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      study_groups: {
        Row: {
          id: string
          class_id: string
          members: unknown
          ai_suggested: boolean
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
    }
    Views: {
      enrollments_public: {
        Row: {
          id: string
          student_id: string
          class_id: string
          status: EnrollmentStatus
          enrolled_at: string
        }
      }
      reviews_public: {
        Row: {
          id: string
          class_id: string
          stars: number
          body_display: string | null
          is_hidden: boolean
          created_at: string
        }
      }
      v_public_dashboard_stats: {
        Row: {
          stat_type: string
          rank: number
          label: string
          value_num: number | null
          value_text: string | null
        }
      }
    }
    Functions: {
      rpc_transition_semester_phase: { Args: { p_semester_id: string; p_next_phase: SemesterPhase }; Returns: string }
      rpc_delete_semester: { Args: { p_semester_id: string }; Returns: string }
      rpc_course_cancellation_scan: { Args: Record<string, never>; Returns: unknown }
      rpc_set_class_location: {
        Args: { p_class_id: string; p_lat: number; p_lng: number; p_label: string }
        Returns: string
      }
      rpc_enroll_in_class: { Args: { p_class_id: string }; Returns: string }
      rpc_post_grade: { Args: { p_enrollment_id: string; p_grade: GradeLetter }; Returns: string }
      rpc_warn_user: { Args: { p_target_id: string; p_reason: string }; Returns: string }
      rpc_decide_application: {
        Args: { p_application_id: string; p_status: AppStatus; p_justification?: string | null }
        Returns: string
      }
      rpc_decide_graduation_application: {
        Args: { p_app_id: string; p_decision: GradAppStatus; p_notes?: string | null }
        Returns: string
      }
      rpc_resolve_complaint: {
        Args: {
          p_complaint_id: string
          p_warn_target_id: string | null
          p_reason?: string | null
          p_resolution?: string | null
        }
        Returns: string
      }
      rpc_semester_gpa: { Args: { p_student_id: string; p_semester_id: string }; Returns: number | null }
      rpc_assign_instructor: {
        Args: { p_class_id: string; p_instructor_id: string | null }
        Returns: string
      }
      rpc_promote_waitlist: { Args: { p_enrollment_id: string }; Returns: string }
      rpc_reject_waitlist: { Args: { p_enrollment_id: string }; Returns: string }
      rpc_drop_class: { Args: { p_enrollment_id: string }; Returns: string }
      rpc_redeem_honor_for_warning: { Args: Record<string, never>; Returns: string }
    }
  }
}
