export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          center_address: string
          center_lat: number
          center_lng: number
          default_zoom: number
          id: number
          updated_at: string
        }
        Insert: {
          center_address: string
          center_lat: number
          center_lng: number
          default_zoom?: number
          id: number
          updated_at?: string
        }
        Update: {
          center_address?: string
          center_lat?: number
          center_lng?: number
          default_zoom?: number
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      enrichments: {
        Row: {
          created_at: string
          error: string | null
          external_id: string | null
          id: string
          point_id: string | null
          provider_id: string
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          external_id?: string | null
          id?: string
          point_id?: string | null
          provider_id: string
          status: string
        }
        Update: {
          created_at?: string
          error?: string | null
          external_id?: string | null
          id?: string
          point_id?: string | null
          provider_id?: string
          status?: string
        }
        Relationships: []
      }
      home_addresses: {
        Row: {
          country: string
          created_at: string
          id: string
          lat: number
          lng: number
          name: string
          position: number
          postal_code: string
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          id?: string
          lat: number
          lng: number
          name: string
          position?: number
          postal_code: string
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          name?: string
          position?: number
          postal_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      pickup_points: {
        Row: {
          address: string
          city: string
          external_id: string | null
          hours_fetched_at: string | null
          id: string
          lat: number
          lng: number
          name: string
          notes: string | null
          opening_hours: Json
          postal_code: string
          provider_id: string
          query_id: string | null
          updated_at: string
        }
        Insert: {
          address: string
          city: string
          external_id?: string | null
          hours_fetched_at?: string | null
          id?: string
          lat: number
          lng: number
          name: string
          notes?: string | null
          opening_hours?: Json
          postal_code: string
          provider_id: string
          query_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string
          city?: string
          external_id?: string | null
          hours_fetched_at?: string | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          notes?: string | null
          opening_hours?: Json
          postal_code?: string
          provider_id?: string
          query_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_points_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      providers: {
        Row: {
          color: string
          created_at: string
          id: string
          logo_url: string
          name: string
          refresh_script: string | null
          refresh_url: string | null
        }
        Insert: {
          color: string
          created_at?: string
          id: string
          logo_url: string
          name: string
          refresh_script?: string | null
          refresh_url?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          logo_url?: string
          name?: string
          refresh_script?: string | null
          refresh_url?: string | null
        }
        Relationships: []
      }
      queries: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          home_address_id: string | null
          id: string
          inserted_count: number
          postal_code: string | null
          provider_id: string
          raw_count: number
          started_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          home_address_id?: string | null
          id?: string
          inserted_count?: number
          postal_code?: string | null
          provider_id: string
          raw_count?: number
          started_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          home_address_id?: string | null
          id?: string
          inserted_count?: number
          postal_code?: string | null
          provider_id?: string
          raw_count?: number
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      latest_pickup_points: {
        Row: {
          address: string | null
          city: string | null
          external_id: string | null
          id: string | null
          lat: number | null
          lng: number | null
          name: string | null
          notes: string | null
          opening_hours: Json | null
          postal_code: string | null
          provider_id: string | null
          query_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pickup_points_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
