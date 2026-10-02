
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "api_tokens": {
                  Row: {
                    "created_at": string,"id": string,"last_used_at": string | null,"name": string,"revoked_at": string | null,"token_hash": string,"token_prefix": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"last_used_at"?: string | null,"name"?: string,"revoked_at"?: string | null,"token_hash": string,"token_prefix": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"last_used_at"?: string | null,"name"?: string,"revoked_at"?: string | null,"token_hash"?: string,"token_prefix"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "api_tokens_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"attempts": {
                  Row: {
                    "build_id": string | null,"challenge_id": string,"challenge_version": number,"correct": boolean | null,"duration_ms": number | null,"expires_at": string,"id": string,"issued_at": string,"lift": number | null,"model_self_reported": string | null,"score": number | null,"seed": string,"status": Database["public"]['Enums']["attempt_status"],"submitted_at": string | null,"tokens_self_reported": number | null,"user_id": string
                  }
                  Insert: {
                    "build_id"?: string | null,"challenge_id": string,"challenge_version": number,"correct"?: boolean | null,"duration_ms"?: number | null,"expires_at": string,"id"?: string,"issued_at"?: string,"lift"?: number | null,"model_self_reported"?: string | null,"score"?: number | null,"seed": string,"status"?: Database["public"]['Enums']["attempt_status"],"submitted_at"?: string | null,"tokens_self_reported"?: number | null,"user_id": string
                  }
                  Update: {
                    "build_id"?: string | null,"challenge_id"?: string,"challenge_version"?: number,"correct"?: boolean | null,"duration_ms"?: number | null,"expires_at"?: string,"id"?: string,"issued_at"?: string,"lift"?: number | null,"model_self_reported"?: string | null,"score"?: number | null,"seed"?: string,"status"?: Database["public"]['Enums']["attempt_status"],"submitted_at"?: string | null,"tokens_self_reported"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attempts_build_id_fkey"
      columns: ["build_id"]
isOneToOne: false
      referencedRelation: "builds"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempts_challenge_id_fkey"
      columns: ["challenge_id"]
isOneToOne: false
      referencedRelation: "challenges"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"baselines": {
                  Row: {
                    "avg_duration_ms": number | null,"avg_score": number,"challenge_id": string,"measured_at": string,"model": string,"pass_rate": number,"runs": number
                  }
                  Insert: {
                    "avg_duration_ms"?: number | null,"avg_score": number,"challenge_id": string,"measured_at"?: string,"model": string,"pass_rate": number,"runs": number
                  }
                  Update: {
                    "avg_duration_ms"?: number | null,"avg_score"?: number,"challenge_id"?: string,"measured_at"?: string,"model"?: string,"pass_rate"?: number,"runs"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "baselines_challenge_id_fkey"
      columns: ["challenge_id"]
isOneToOne: false
      referencedRelation: "challenges"
      referencedColumns: ["id"]
    }
                  ]
                },"builds": {
                  Row: {
                    "base_model": string,"client": string | null,"created_at": string,"gear": NonNullable<Json>,"id": string,"is_primary": boolean,"name": string,"sprite_id": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "base_model": string,"client"?: string | null,"created_at"?: string,"gear"?: NonNullable<Json>,"id"?: string,"is_primary"?: boolean,"name": string,"sprite_id"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "base_model"?: string,"client"?: string | null,"created_at"?: string,"gear"?: NonNullable<Json>,"id"?: string,"is_primary"?: boolean,"name"?: string,"sprite_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "builds_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"challenges": {
                  Row: {
                    "category": string,"created_at": string,"difficulty": number,"id": string,"is_active": boolean,"league": Database["public"]['Enums']["league"],"summary": string,"time_limit_seconds": number,"title": string,"version": number
                  }
                  Insert: {
                    "category": string,"created_at"?: string,"difficulty": number,"id": string,"is_active"?: boolean,"league": Database["public"]['Enums']["league"],"summary": string,"time_limit_seconds"?: number,"title": string,"version"?: number
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"difficulty"?: number,"id"?: string,"is_active"?: boolean,"league"?: Database["public"]['Enums']["league"],"summary"?: string,"time_limit_seconds"?: number,"title"?: string,"version"?: number
                  }
                  Relationships: [
                    
                  ]
                },"events": {
                  Row: {
                    "created_at": string,"id": number,"name": string,"props": NonNullable<Json>,"user_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: never,"name": string,"props"?: NonNullable<Json>,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"name"?: string,"props"?: NonNullable<Json>,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"gear_registry": {
                  Row: {
                    "capabilities": (string)[],"category": string,"created_at": string,"homepage": string | null,"id": string,"kind": Database["public"]['Enums']["gear_kind"],"match_patterns": (string)[],"name": string,"risk_notes": string | null
                  }
                  Insert: {
                    "capabilities"?: (string)[],"category": string,"created_at"?: string,"homepage"?: string | null,"id": string,"kind": Database["public"]['Enums']["gear_kind"],"match_patterns"?: (string)[],"name": string,"risk_notes"?: string | null
                  }
                  Update: {
                    "capabilities"?: (string)[],"category"?: string,"created_at"?: string,"homepage"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["gear_kind"],"match_patterns"?: (string)[],"name"?: string,"risk_notes"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"loadout_scans": {
                  Row: {
                    "build_id": string | null,"created_at": string,"findings": NonNullable<Json>,"id": string,"summary": NonNullable<Json>,"user_id": string
                  }
                  Insert: {
                    "build_id"?: string | null,"created_at"?: string,"findings"?: NonNullable<Json>,"id"?: string,"summary": NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "build_id"?: string | null,"created_at"?: string,"findings"?: NonNullable<Json>,"id"?: string,"summary"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "loadout_scans_build_id_fkey"
      columns: ["build_id"]
isOneToOne: false
      referencedRelation: "builds"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "loadout_scans_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"bio": string | null,"created_at": string,"display_name": string | null,"id": string,"updated_at": string,"username": string
                  }
                  Insert: {
                    "avatar_url"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string | null,"id": string,"updated_at"?: string,"username": string
                  }
                  Update: {
                    "avatar_url"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string | null,"id"?: string,"updated_at"?: string,"username"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            "attempt_status": "issued"|"passed"|"failed"|"expired","gear_kind": "mcp"|"skill"|"plugin"|"hook"|"cli"|"extension"|"memory"|"other","league": "global"|"thai"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "attempt_status": ["issued", "passed", "failed", "expired"],"gear_kind": ["mcp", "skill", "plugin", "hook", "cli", "extension", "memory", "other"],"league": ["global", "thai"]
          }
        }
} as const
