export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          value: string
          updated_at: string
        }
        Insert: {
          key: string
          value: string
          updated_at?: string
        }
        Update: {
          key?: string
          value?: string
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          address: string | null
          consignment_id: string | null
          courier_message: string | null
          courier_status: string | null
          created_at: string
          customer_name: string | null
          delivery_rate: number | null
          fraud_checked: boolean | null
          fraud_data: Json | null
          fulfillment_status: string | null
          id: string
          notes: string | null
          order_number: string
          phone: string | null
          price: number | null
          product: string | null
          quantity: number | null
          sent_to_courier: boolean | null
          shopify_order_id: number
          status: string
          tracking_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          consignment_id?: string | null
          courier_message?: string | null
          courier_status?: string | null
          created_at?: string
          customer_name?: string | null
          delivery_rate?: number | null
          fraud_checked?: boolean | null
          fraud_data?: Json | null
          fulfillment_status?: string | null
          id?: string
          notes?: string | null
          order_number: string
          phone?: string | null
          price?: number | null
          product?: string | null
          quantity?: number | null
          sent_to_courier?: boolean | null
          shopify_order_id: number
          status?: string
          tracking_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          consignment_id?: string | null
          courier_message?: string | null
          courier_status?: string | null
          created_at?: string
          customer_name?: string | null
          delivery_rate?: number | null
          fraud_checked?: boolean | null
          fraud_data?: Json | null
          fulfillment_status?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          phone?: string | null
          price?: number | null
          product?: string | null
          quantity?: number | null
          sent_to_courier?: boolean | null
          shopify_order_id?: number
          status?: string
          tracking_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string
          id: string
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      social_conversations: {
        Row: {
          id: string
          platform: string
          contact_id: string
          contact_name: string | null
          contact_avatar: string | null
          last_message: string | null
          last_message_at: string | null
          unread_count: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          platform: string
          contact_id: string
          contact_name?: string | null
          contact_avatar?: string | null
          last_message?: string | null
          last_message_at?: string | null
          unread_count?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          platform?: string
          contact_id?: string
          contact_name?: string | null
          contact_avatar?: string | null
          last_message?: string | null
          last_message_at?: string | null
          unread_count?: number | null
          created_at?: string | null
        }
        Relationships: []
      }
      social_messages: {
        Row: {
          id: string
          conversation_id: string | null
          sender: string
          content: string | null
          image_url: string | null
          message_type: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          conversation_id?: string | null
          sender: string
          content?: string | null
          image_url?: string | null
          message_type?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          conversation_id?: string | null
          sender?: string
          content?: string | null
          image_url?: string | null
          message_type?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "social_conversations"
            referencedColumns: ["id"]
          }
        ]
      }
      social_inbox_orders: {
        Row: {
          id: string
          conversation_id: string | null
          platform: string
          contact_name: string | null
          contact_id: string | null
          items: Json | null
          notes: string | null
          total_price: number | null
          status: string | null
          sent_to_courier: boolean | null
          consignment_id: string | null
          tracking_code: string | null
          courier_status: string | null
          courier_message: string | null
          fraud_checked: boolean | null
          fraud_data: Json | null
          delivery_rate: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          conversation_id?: string | null
          platform: string
          contact_name?: string | null
          contact_id?: string | null
          items?: Json | null
          notes?: string | null
          total_price?: number | null
          status?: string | null
          sent_to_courier?: boolean | null
          consignment_id?: string | null
          tracking_code?: string | null
          courier_status?: string | null
          courier_message?: string | null
          fraud_checked?: boolean | null
          fraud_data?: Json | null
          delivery_rate?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          conversation_id?: string | null
          platform?: string
          contact_name?: string | null
          contact_id?: string | null
          items?: Json | null
          notes?: string | null
          total_price?: number | null
          status?: string | null
          sent_to_courier?: boolean | null
          consignment_id?: string | null
          tracking_code?: string | null
          courier_status?: string | null
          courier_message?: string | null
          fraud_checked?: boolean | null
          fraud_data?: Json | null
          delivery_rate?: number | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_inbox_orders_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "social_conversations"
            referencedColumns: ["id"]
          }
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "team_member"
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
    Enums: {
      app_role: ["admin", "team_member"],
    },
  },
} as const
