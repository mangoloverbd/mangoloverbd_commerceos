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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      ai_action_log: {
        Row: {
          after_snapshot: Json | null
          applied_at: string
          args: Json
          before_snapshot: Json | null
          call_id: string
          id: string
          org_id: string
          tool: string
          user_id: string
        }
        Insert: {
          after_snapshot?: Json | null
          applied_at?: string
          args: Json
          before_snapshot?: Json | null
          call_id: string
          id?: string
          org_id: string
          tool: string
          user_id: string
        }
        Update: {
          after_snapshot?: Json | null
          applied_at?: string
          args?: Json
          before_snapshot?: Json | null
          call_id?: string
          id?: string
          org_id?: string
          tool?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      meta_ad_accounts: {
        Row: {
          account_name: string | null
          ad_account_id: string
          connection_id: string | null
          created_at: string
          currency: string | null
          id: string
          org_id: string
          status: string
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          ad_account_id: string
          connection_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          org_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          ad_account_id?: string
          connection_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          org_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_accounts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "meta_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_connections: {
        Row: {
          connected_by_user_id: string | null
          created_at: string
          encrypted_user_access_token: string | null
          id: string
          meta_user_id: string | null
          meta_user_name: string | null
          org_id: string
          scopes: string[]
          status: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          connected_by_user_id?: string | null
          created_at?: string
          encrypted_user_access_token?: string | null
          id?: string
          meta_user_id?: string | null
          meta_user_name?: string | null
          org_id: string
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          connected_by_user_id?: string | null
          created_at?: string
          encrypted_user_access_token?: string | null
          id?: string
          meta_user_id?: string | null
          meta_user_name?: string | null
          org_id?: string
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      meta_instagram_accounts: {
        Row: {
          account_name: string | null
          connection_id: string | null
          created_at: string
          id: string
          instagram_account_id: string
          org_id: string
          page_id: string | null
          status: string
          updated_at: string
          username: string | null
        }
        Insert: {
          account_name?: string | null
          connection_id?: string | null
          created_at?: string
          id?: string
          instagram_account_id: string
          org_id: string
          page_id?: string | null
          status?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          account_name?: string | null
          connection_id?: string | null
          created_at?: string
          id?: string
          instagram_account_id?: string
          org_id?: string
          page_id?: string | null
          status?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_instagram_accounts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "meta_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_pages: {
        Row: {
          connection_id: string | null
          created_at: string
          encrypted_page_access_token: string | null
          id: string
          instagram_account_id: string | null
          org_id: string
          page_id: string
          page_name: string | null
          status: string
          updated_at: string
          webhook_subscribed: boolean
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          encrypted_page_access_token?: string | null
          id?: string
          instagram_account_id?: string | null
          org_id: string
          page_id: string
          page_name?: string | null
          status?: string
          updated_at?: string
          webhook_subscribed?: boolean
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          encrypted_page_access_token?: string | null
          id?: string
          instagram_account_id?: string | null
          org_id?: string
          page_id?: string
          page_name?: string | null
          status?: string
          updated_at?: string
          webhook_subscribed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "meta_pages_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "meta_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_webhook_events: {
        Row: {
          created_at: string
          event_type: string | null
          id: string
          instagram_account_id: string | null
          object_type: string | null
          org_id: string | null
          page_id: string | null
          payload: Json
          platform: string | null
          processed_at: string | null
          sender_id: string | null
        }
        Insert: {
          created_at?: string
          event_type?: string | null
          id?: string
          instagram_account_id?: string | null
          object_type?: string | null
          org_id?: string | null
          page_id?: string | null
          payload?: Json
          platform?: string | null
          processed_at?: string | null
          sender_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string | null
          id?: string
          instagram_account_id?: string | null
          object_type?: string | null
          org_id?: string | null
          page_id?: string | null
          payload?: Json
          platform?: string | null
          processed_at?: string | null
          sender_id?: string | null
        }
        Relationships: []
      }
      meta_whatsapp_accounts: {
        Row: {
          account_name: string | null
          connection_id: string | null
          created_at: string
          display_phone_number: string | null
          encrypted_access_token: string | null
          id: string
          org_id: string
          phone_number_id: string | null
          status: string
          updated_at: string
          whatsapp_business_account_id: string
        }
        Insert: {
          account_name?: string | null
          connection_id?: string | null
          created_at?: string
          display_phone_number?: string | null
          encrypted_access_token?: string | null
          id?: string
          org_id: string
          phone_number_id?: string | null
          status?: string
          updated_at?: string
          whatsapp_business_account_id: string
        }
        Update: {
          account_name?: string | null
          connection_id?: string | null
          created_at?: string
          display_phone_number?: string | null
          encrypted_access_token?: string | null
          id?: string
          org_id?: string
          phone_number_id?: string | null
          status?: string
          updated_at?: string
          whatsapp_business_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_whatsapp_accounts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "meta_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      order_chat_history: {
        Row: {
          created_at: string
          id: string
          message_count: number
          messages: Json
          org_id: string
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message_count?: number
          messages?: Json
          org_id: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message_count?: number
          messages?: Json
          org_id?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          org_id: string
          product_id: string | null
          product_name: string
          quantity: number
          unit_price: number
          updated_at: string
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          org_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          unit_price: number
          updated_at?: string
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          org_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price?: number
          updated_at?: string
          variant_id?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address: string | null
          advanced_payment: number
          consignment_id: string | null
          courier_fee: number | null
          courier_message: string | null
          courier_name: string | null
          courier_status: string | null
          created_at: string
          customer_name: string | null
          delivery_rate: number | null
          discount: number
          fraud_checked: boolean | null
          fraud_data: Json | null
          fulfillment_status: string | null
          id: string
          notes: string | null
          order_number: string
          org_id: string
          payment_method: string | null
          phone: string | null
          price: number | null
          product: string | null
          quantity: number | null
          return_reason: string | null
          return_requested_at: string | null
          return_status: string | null
          sent_to_courier: boolean | null
          shopify_order_id: number | null
          source: string | null
          status: string
          tracking_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          advanced_payment?: number
          consignment_id?: string | null
          courier_fee?: number | null
          courier_message?: string | null
          courier_name?: string | null
          courier_status?: string | null
          created_at?: string
          customer_name?: string | null
          delivery_rate?: number | null
          discount?: number
          fraud_checked?: boolean | null
          fraud_data?: Json | null
          fulfillment_status?: string | null
          id?: string
          notes?: string | null
          order_number: string
          org_id: string
          payment_method?: string | null
          phone?: string | null
          price?: number | null
          product?: string | null
          quantity?: number | null
          return_reason?: string | null
          return_requested_at?: string | null
          return_status?: string | null
          sent_to_courier?: boolean | null
          shopify_order_id?: number | null
          source?: string | null
          status?: string
          tracking_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          advanced_payment?: number
          consignment_id?: string | null
          courier_fee?: number | null
          courier_message?: string | null
          courier_name?: string | null
          courier_status?: string | null
          created_at?: string
          customer_name?: string | null
          delivery_rate?: number | null
          discount?: number
          fraud_checked?: boolean | null
          fraud_data?: Json | null
          fulfillment_status?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          org_id?: string
          payment_method?: string | null
          phone?: string | null
          price?: number | null
          product?: string | null
          quantity?: number | null
          return_reason?: string | null
          return_requested_at?: string | null
          return_status?: string | null
          sent_to_courier?: boolean | null
          shopify_order_id?: number | null
          source?: string | null
          status?: string
          tracking_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          image_url: string
          is_primary: boolean
          org_id: string
          product_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          image_url: string
          is_primary?: boolean
          org_id: string
          product_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          image_url?: string
          is_primary?: boolean
          org_id?: string
          product_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          attributes: Json
          cog: number
          created_at: string
          id: string
          org_id: string
          price_adjustment: number
          product_id: string
          stock_quantity: number
        }
        Insert: {
          attributes?: Json
          cog?: number
          created_at?: string
          id?: string
          org_id: string
          price_adjustment?: number
          product_id: string
          stock_quantity?: number
        }
        Update: {
          attributes?: Json
          cog?: number
          created_at?: string
          id?: string
          org_id?: string
          price_adjustment?: number
          product_id?: string
          stock_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          cog: number
          compare_at_price: number | null
          created_at: string
          description: string | null
          id: string
          image_description: string | null
          image_embedding: string | null
          image_url: string | null
          name: string
          org_id: string
          published: boolean
          published_at: string | null
          selling_price: number | null
          slug: string | null
          source_url: string | null
          stock_quantity: number
          updated_at: string
          url: string | null
        }
        Insert: {
          cog?: number
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_description?: string | null
          image_embedding?: string | null
          image_url?: string | null
          name: string
          org_id: string
          published?: boolean
          published_at?: string | null
          selling_price?: number | null
          slug?: string | null
          source_url?: string | null
          stock_quantity?: number
          updated_at?: string
          url?: string | null
        }
        Update: {
          cog?: number
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_description?: string | null
          image_embedding?: string | null
          image_url?: string | null
          name?: string
          org_id?: string
          published?: boolean
          published_at?: string | null
          selling_price?: number | null
          slug?: string | null
          source_url?: string | null
          stock_quantity?: number
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      social_conversations: {
        Row: {
          ai_summary: string
          contact_avatar: string | null
          contact_id: string
          contact_name: string | null
          created_at: string
          id: string
          last_message: string | null
          last_message_at: string | null
          order_fields: Json
          org_id: string
          paused_ai: boolean
          platform: string
          unread_count: number
        }
        Insert: {
          ai_summary?: string
          contact_avatar?: string | null
          contact_id: string
          contact_name?: string | null
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          order_fields?: Json
          org_id: string
          paused_ai?: boolean
          platform: string
          unread_count?: number
        }
        Update: {
          ai_summary?: string
          contact_avatar?: string | null
          contact_id?: string
          contact_name?: string | null
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          order_fields?: Json
          org_id?: string
          paused_ai?: boolean
          platform?: string
          unread_count?: number
        }
        Relationships: []
      }
      social_inbox_orders: {
        Row: {
          consignment_id: string | null
          contact_id: string | null
          contact_name: string | null
          conversation_id: string | null
          courier_fee: number | null
          courier_message: string | null
          courier_name: string | null
          courier_status: string | null
          created_at: string
          delivery_rate: number | null
          fraud_checked: boolean
          fraud_data: Json | null
          id: string
          items: Json | null
          notes: string | null
          org_id: string
          platform: string
          return_reason: string | null
          return_requested_at: string | null
          return_status: string | null
          sent_to_courier: boolean
          status: string
          total_price: number
          tracking_code: string | null
        }
        Insert: {
          consignment_id?: string | null
          contact_id?: string | null
          contact_name?: string | null
          conversation_id?: string | null
          courier_fee?: number | null
          courier_message?: string | null
          courier_name?: string | null
          courier_status?: string | null
          created_at?: string
          delivery_rate?: number | null
          fraud_checked?: boolean
          fraud_data?: Json | null
          id?: string
          items?: Json | null
          notes?: string | null
          org_id: string
          platform: string
          return_reason?: string | null
          return_requested_at?: string | null
          return_status?: string | null
          sent_to_courier?: boolean
          status?: string
          total_price?: number
          tracking_code?: string | null
        }
        Update: {
          consignment_id?: string | null
          contact_id?: string | null
          contact_name?: string | null
          conversation_id?: string | null
          courier_fee?: number | null
          courier_message?: string | null
          courier_name?: string | null
          courier_status?: string | null
          created_at?: string
          delivery_rate?: number | null
          fraud_checked?: boolean
          fraud_data?: Json | null
          id?: string
          items?: Json | null
          notes?: string | null
          org_id?: string
          platform?: string
          return_reason?: string | null
          return_requested_at?: string | null
          return_status?: string | null
          sent_to_courier?: boolean
          status?: string
          total_price?: number
          tracking_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_inbox_orders_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "social_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      social_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          image_url: string | null
          message_type: string
          sender: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          message_type?: string
          sender: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          message_type?: string
          sender?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "social_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_settings: {
        Row: {
          background_color: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          custom_domain: string | null
          custom_domain_status: string | null
          enabled: boolean
          favicon_url: string | null
          font_family: string
          id: string
          logo_url: string | null
          org_id: string
          primary_color: string
          seo_description_template: string
          seo_title_template: string
          shipping_zones: Json
          social_facebook: string | null
          social_instagram: string | null
          social_tiktok: string | null
          store_name: string | null
          tagline: string | null
          updated_at: string
        }
        Insert: {
          background_color?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          custom_domain?: string | null
          custom_domain_status?: string | null
          enabled?: boolean
          favicon_url?: string | null
          font_family?: string
          id?: string
          logo_url?: string | null
          org_id: string
          primary_color?: string
          seo_description_template?: string
          seo_title_template?: string
          shipping_zones?: Json
          social_facebook?: string | null
          social_instagram?: string | null
          social_tiktok?: string | null
          store_name?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          background_color?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          custom_domain?: string | null
          custom_domain_status?: string | null
          enabled?: boolean
          favicon_url?: string | null
          font_family?: string
          id?: string
          logo_url?: string | null
          org_id?: string
          primary_color?: string
          seo_description_template?: string
          seo_title_template?: string
          shipping_zones?: Json
          social_facebook?: string | null
          social_instagram?: string | null
          social_tiktok?: string | null
          store_name?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          org_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string | null
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
      match_products_by_embedding: {
        Args: {
          match_count?: number
          match_org_id: string
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          id: string
          image_description: string
          image_url: string
          name: string
          selling_price: number
          similarity: number
        }[]
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
