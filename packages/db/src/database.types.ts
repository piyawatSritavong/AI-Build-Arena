
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
            "achievements": {
                  Row: {
                    "awarded_at": string,"code": string,"meta": NonNullable<Json>,"user_id": string
                  }
                  Insert: {
                    "awarded_at"?: string,"code": string,"meta"?: NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "awarded_at"?: string,"code"?: string,"meta"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "achievements_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"api_tokens": {
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
                    "build_id": string | null,"challenge_id": string,"challenge_version": number,"client": string | null,"correct": boolean | null,"duration_ms": number | null,"expires_at": string,"id": string,"issued_at": string,"lift": number | null,"mode": Database["public"]['Enums']["attempt_mode"],"model_self_reported": string | null,"score": number | null,"seed": string,"source": Database["public"]['Enums']["result_source"],"status": Database["public"]['Enums']["attempt_status"],"submitted_at": string | null,"tokens_measured": number | null,"tokens_self_reported": number | null,"user_id": string,"variant_id": string | null
                  }
                  Insert: {
                    "build_id"?: string | null,"challenge_id": string,"challenge_version": number,"client"?: string | null,"correct"?: boolean | null,"duration_ms"?: number | null,"expires_at": string,"id"?: string,"issued_at"?: string,"lift"?: number | null,"mode"?: Database["public"]['Enums']["attempt_mode"],"model_self_reported"?: string | null,"score"?: number | null,"seed": string,"source"?: Database["public"]['Enums']["result_source"],"status"?: Database["public"]['Enums']["attempt_status"],"submitted_at"?: string | null,"tokens_measured"?: number | null,"tokens_self_reported"?: number | null,"user_id": string,"variant_id"?: string | null
                  }
                  Update: {
                    "build_id"?: string | null,"challenge_id"?: string,"challenge_version"?: number,"client"?: string | null,"correct"?: boolean | null,"duration_ms"?: number | null,"expires_at"?: string,"id"?: string,"issued_at"?: string,"lift"?: number | null,"mode"?: Database["public"]['Enums']["attempt_mode"],"model_self_reported"?: string | null,"score"?: number | null,"seed"?: string,"source"?: Database["public"]['Enums']["result_source"],"status"?: Database["public"]['Enums']["attempt_status"],"submitted_at"?: string | null,"tokens_measured"?: number | null,"tokens_self_reported"?: number | null,"user_id"?: string,"variant_id"?: string | null
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
    },{
      foreignKeyName: "attempts_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "build_variants"
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
                },"build_variants": {
                  Row: {
                    "added_gear": (string)[],"build_id": string,"created_at": string,"id": string,"kind": Database["public"]['Enums']["variant_kind"],"label": string,"removed_gear": (string)[],"user_id": string
                  }
                  Insert: {
                    "added_gear"?: (string)[],"build_id": string,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["variant_kind"],"label": string,"removed_gear"?: (string)[],"user_id": string
                  }
                  Update: {
                    "added_gear"?: (string)[],"build_id"?: string,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["variant_kind"],"label"?: string,"removed_gear"?: (string)[],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "build_variants_build_id_fkey"
      columns: ["build_id"]
isOneToOne: false
      referencedRelation: "builds"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "build_variants_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"builds": {
                  Row: {
                    "base_model": string,"client": string | null,"created_at": string,"gear": NonNullable<Json>,"id": string,"is_primary": boolean,"loadout_visibility": Database["public"]['Enums']["loadout_visibility"],"name": string,"sprite_id": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "base_model": string,"client"?: string | null,"created_at"?: string,"gear"?: NonNullable<Json>,"id"?: string,"is_primary"?: boolean,"loadout_visibility"?: Database["public"]['Enums']["loadout_visibility"],"name": string,"sprite_id"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "base_model"?: string,"client"?: string | null,"created_at"?: string,"gear"?: NonNullable<Json>,"id"?: string,"is_primary"?: boolean,"loadout_visibility"?: Database["public"]['Enums']["loadout_visibility"],"name"?: string,"sprite_id"?: string,"updated_at"?: string,"user_id"?: string
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
                },"cli_device_codes": {
                  Row: {
                    "approved_at": string | null,"client_name": string,"consumed_at": string | null,"created_at": string,"device_code_hash": string,"expires_at": string,"id": string,"user_code": string,"user_id": string | null
                  }
                  Insert: {
                    "approved_at"?: string | null,"client_name": string,"consumed_at"?: string | null,"created_at"?: string,"device_code_hash": string,"expires_at": string,"id"?: string,"user_code": string,"user_id"?: string | null
                  }
                  Update: {
                    "approved_at"?: string | null,"client_name"?: string,"consumed_at"?: string | null,"created_at"?: string,"device_code_hash"?: string,"expires_at"?: string,"id"?: string,"user_code"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cli_device_codes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
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
                },"gear_stats": {
                  Row: {
                    "ablation_runs": number,"adopters": number,"adoption_rate": number | null,"computed_at": string,"gear_id": string,"lift_delta": number | null,"lift_delta_ci_high": number | null,"lift_delta_ci_low": number | null,"segment": string,"segment_value": string
                  }
                  Insert: {
                    "ablation_runs"?: number,"adopters"?: number,"adoption_rate"?: number | null,"computed_at"?: string,"gear_id": string,"lift_delta"?: number | null,"lift_delta_ci_high"?: number | null,"lift_delta_ci_low"?: number | null,"segment": string,"segment_value"?: string
                  }
                  Update: {
                    "ablation_runs"?: number,"adopters"?: number,"adoption_rate"?: number | null,"computed_at"?: string,"gear_id"?: string,"lift_delta"?: number | null,"lift_delta_ci_high"?: number | null,"lift_delta_ci_low"?: number | null,"segment"?: string,"segment_value"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gear_stats_gear_id_fkey"
      columns: ["gear_id"]
isOneToOne: false
      referencedRelation: "gear_registry"
      referencedColumns: ["id"]
    }
                  ]
                },"loadout_scans": {
                  Row: {
                    "build_id": string | null,"created_at": string,"findings": NonNullable<Json>,"gear": NonNullable<Json>,"id": string,"source": Database["public"]['Enums']["scan_source"],"summary": NonNullable<Json>,"user_id": string
                  }
                  Insert: {
                    "build_id"?: string | null,"created_at"?: string,"findings"?: NonNullable<Json>,"gear"?: NonNullable<Json>,"id"?: string,"source"?: Database["public"]['Enums']["scan_source"],"summary": NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "build_id"?: string | null,"created_at"?: string,"findings"?: NonNullable<Json>,"gear"?: NonNullable<Json>,"id"?: string,"source"?: Database["public"]['Enums']["scan_source"],"summary"?: NonNullable<Json>,"user_id"?: string
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
                    "avatar_url": string | null,"bio": string | null,"created_at": string,"display_name": string | null,"id": string,"professions": (string)[],"trust_score": number,"updated_at": string,"username": string
                  }
                  Insert: {
                    "avatar_url"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string | null,"id": string,"professions"?: (string)[],"trust_score"?: number,"updated_at"?: string,"username": string
                  }
                  Update: {
                    "avatar_url"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string | null,"id"?: string,"professions"?: (string)[],"trust_score"?: number,"updated_at"?: string,"username"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_limits": {
                  Row: {
                    "hits": number,"key": string,"window_start": string
                  }
                  Insert: {
                    "hits"?: number,"key": string,"window_start": string
                  }
                  Update: {
                    "hits"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "best_passes":
{ Args: { "p_league"?: Database["public"]['Enums']["league"] }; Returns: {
              "category": string,"challenge_id": string,"league": Database["public"]['Enums']["league"],"lift": number,"score": number,"user_id": string
            }[]
                           },
"community_stock_baseline":
{ Args: { "p_challenge": string,"p_exclude"?: string,"p_model": string }; Returns: {
              "runs": number,"score": number
            }[]
                           },
"leaderboard":
{ Args: { "p_league"?: Database["public"]['Enums']["league"],"p_limit"?: number }; Returns: {
              "avatar_url": string,"avg_lift": number,"base_model": string,"display_name": string,"lift_challenges": number,"lift_own": number,"lift_verified": number,"passed": number,"rank": number,"sprite_id": string,"total_score": number,"username": string
            }[]
                           },
"lift_baseline":
{ Args: { "p_build": string,"p_challenge": string,"p_user": string }; Returns: {
              "basis": string,"runs": number,"score": number,"verified": boolean
            }[]
                           },
"normalized_gain":
{ Args: { "p_base": number,"p_full": number }; Returns: number
                           },
"own_primary_build":
{ Args: Record<PropertyKey, never>; Returns: {
              "base_model": string,"client": string,"gear": Json,"id": string,"loadout_visibility": Database["public"]['Enums']["loadout_visibility"],"name": string,"sprite_id": string
            }[]
                           },
"paired_lifts":
{ Args: { "p_challenge"?: string,"p_user"?: string }; Returns: {
              "baseline_runs": number,"baseline_score": number,"basis": string,"challenge_id": string,"full_runs": number,"full_score": number,"lift": number,"user_id": string,"verified": boolean,"weight": number
            }[]
                           },
"profile_card":
{ Args: { "p_username": string }; Returns: Json
                           },
"rate_limit_hit":
{ Args: { "p_key": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           }
          }
          Enums: {
            "attempt_mode": "ranked"|"practice","attempt_status": "issued"|"passed"|"failed"|"expired","gear_kind": "mcp"|"skill"|"plugin"|"hook"|"cli"|"extension"|"memory"|"other","league": "global"|"thai","loadout_visibility": "hidden"|"categories"|"names"|"install","result_source": "mcp"|"cli","scan_source": "paste"|"cli","variant_kind": "full"|"stock"|"ablation"|"custom"
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
            "attempt_mode": ["ranked", "practice"],"attempt_status": ["issued", "passed", "failed", "expired"],"gear_kind": ["mcp", "skill", "plugin", "hook", "cli", "extension", "memory", "other"],"league": ["global", "thai"],"loadout_visibility": ["hidden", "categories", "names", "install"],"result_source": ["mcp", "cli"],"scan_source": ["paste", "cli"],"variant_kind": ["full", "stock", "ablation", "custom"]
          }
        }
} as const
