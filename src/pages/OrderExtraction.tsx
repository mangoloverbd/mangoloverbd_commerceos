import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PlasticButton } from "@/components/ui/plastic-button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  Truck,
  CheckCircle2,
  Loader2,
  Sparkles,
  Package,
  Search,
  ArrowUpDown,
  ExternalLink,
  Plus,
  Minus,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";

interface ExtractedOrder {
  customer_name: string;
  phone: string;
  address: string;
  product: string;
  quantity: number;
  price: number;
  delivery_charge: number;
  location_type: "inside_dhaka" | "outside_dhaka";
}

interface Product {
  id: string;
  name: string;
  selling_price: number | null;
  cog: number | null;
  image_url: string | null;
  url: string | null;
  created_at: string;
}

interface OrderLine {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export default function OrderExtraction() {
  const { isAdmin } = useUserRole();
  const [orderText, setOrderText] = useState("");
  const [extractedOrder, setExtractedOrder] = useState<ExtractedOrder | null>(null);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [addProductId, setAddProductId] = useState<string>("");
  const [extracting, setExtracting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [manualEdit, setManualEdit] = useState(false);

  // Products state — sourced from Products catalog (/api/products)
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productSearch, setProductSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "price">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    filterAndSortProducts();
  }, [products, productSearch, sortBy, sortOrder]);

  const fetchProducts = async () => {
    try {
      const res = await apiFetch("/api/products");
      if (!res.ok) throw new Error("Failed to fetch");
      const { products: data } = await res.json();
      setProducts(data || []);
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoadingProducts(false);
    }
  };

  const addProductLine = (productId: string) => {
    if (!productId) return;
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setOrderLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: product.name, unitPrice: product.selling_price ?? 0, quantity: 1 },
    ]);
    setAddProductId("");
  };

  const updateLineQty = (lineId: string, delta: number) => {
    setOrderLines((prev) =>
      prev.map((l) => l.id === lineId ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l)
    );
  };

  const removeOrderLine = (lineId: string) => {
    setOrderLines((prev) => prev.filter((l) => l.id !== lineId));
  };

  const filterAndSortProducts = () => {
    let filtered = products.filter((product) =>
      product.name.toLowerCase().includes(productSearch.toLowerCase())
    );

    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "price":
          comparison = (a.selling_price ?? 0) - (b.selling_price ?? 0);
          break;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    setFilteredProducts(filtered);
  };

  const toggleSort = (field: "name" | "price") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const extractOrderFromText = async () => {
    if (!orderText.trim()) {
      toast.error("Please paste the order text first");
      return;
    }

    setExtracting(true);
    try {
      const res = await apiFetch("/api/extract-order-from-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderText }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Extraction failed");

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      if (data?.extractedOrder) {
        setExtractedOrder(data.extractedOrder);
        setOrderLines([{
          id: crypto.randomUUID(),
          name: data.extractedOrder.product,
          unitPrice: data.extractedOrder.price,
          quantity: data.extractedOrder.quantity,
        }]);
        toast.success("Order details extracted successfully!");
      }
    } catch (error) {
      console.error("Error extracting order:", error);
      toast.error("Failed to extract order details");
    } finally {
      setExtracting(false);
    }
  };

  const determineDeliveryCharge = (address: string) => {
    const lowerAddress = address.toLowerCase();
    const dhakaKeywords = [
      "dhaka", "dhanmondi", "gulshan", "banani", "mirpur", "mohammadpur",
      "uttara", "badda", "khilgaon", "motijheel", "paltan", "farmgate",
      "shahbagh", "new market", "azampur", "kurmitola", "tejgaon",
    ];
    const isInsideDhaka = dhakaKeywords.some((k) => lowerAddress.includes(k));
    return {
      charge: isInsideDhaka ? 80 : 120,
      type: (isInsideDhaka ? "inside_dhaka" : "outside_dhaka") as "inside_dhaka" | "outside_dhaka",
    };
  };

  const createOrder = async () => {
    if (!extractedOrder) {
      toast.error("Please extract order details first");
      return;
    }
    if (orderLines.length === 0) {
      toast.error("Please add at least one product");
      return;
    }

    const subtotal = orderLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const allProducts = orderLines.map((l) => l.name).join(", ");
    const totalQty = orderLines.reduce((s, l) => s + l.quantity, 0);

    setCreating(true);
    try {
      const { error } = await supabase
        .from("orders")
        .insert([{
          shopify_order_id: -(Math.floor(Math.random() * 9_000_000_000_000) + 1_000_000_000_000),
          order_number: `MAN-${Date.now()}`,
          customer_name: extractedOrder.customer_name,
          phone: extractedOrder.phone,
          address: extractedOrder.address,
          product: allProducts,
          quantity: totalQty,
          price: subtotal,
          delivery_rate: extractedOrder.delivery_charge,
          status: "pending",
          fraud_checked: false,
          fulfillment_status: "unfulfilled",
        }]);

      if (error) throw error;

      toast.custom(() => (
        <div className="bg-white border border-black/5 shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px]">
          <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-black">Order Created</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold text-black">{extractedOrder.customer_name}</span>
              <span className="text-xs text-black font-medium">added to dashboard</span>
            </div>
          </div>
        </div>
      ));

      setOrderText("");
      setExtractedOrder(null);
      setOrderLines([]);
      setManualEdit(false);
    } catch (error) {
      console.error("Error creating order:", error);
      toast.error("Failed to create order");
    } finally {
      setCreating(false);
    }
  };

  const updateExtractedOrder = (field: keyof ExtractedOrder, value: string | number) => {
    if (!extractedOrder) return;
    const updated = { ...extractedOrder, [field]: value };
    if (field === "address") {
      const { charge, type } = determineDeliveryCharge(value as string);
      updated.delivery_charge = charge;
      updated.location_type = type;
    }
    setExtractedOrder(updated);
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-[#1A1A1A]">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-black/5 bg-white/80 backdrop-blur-xl px-6 h-16">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-black flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-white" />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-black">Order Extraction</span>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-6 py-16 space-y-16">
        {/* Hero Section */}
        <section className="space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/5 text-black text-[10px] font-bold uppercase tracking-wider"
          >
            <Sparkles className="w-3 h-3" />
            AI-Powered Processing
          </motion.div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-4">
              <motion.h1
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-5xl lg:text-6xl font-normal leading-tight"
              >
                Order <span className="italic text-black underline decoration-black/10 transition-colors hover:text-black">Extraction</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-lg text-black max-w-2xl font-light"
              >
                Paste messenger or social media order text and let AI extract customer details, delivery location, and calculate charges automatically.
              </motion.p>
            </div>
          </div>
        </section>

        {/* Main Content */}
        <motion.section
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid gap-8 lg:grid-cols-2"
        >
          {/* Input Section */}
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-black"></div>
                <h3 className="text-sm font-bold uppercase tracking-widest">Order Text Input</h3>
              </div>
              <p className="text-xs text-black font-light">Paste the complete order text from messenger or social media</p>
            </div>

            <div className="space-y-4">
              <Textarea
                placeholder="Paste the order message here... Example: 'Hi, I want to order 2 t-shirts. My name is Rahim, phone: 01712345678, address: House 12, Road 5, Dhanmondi, Dhaka'"
                value={orderText}
                onChange={(e) => setOrderText(e.target.value)}
                className="min-h-[200px] bg-[#F8F8F8] border-none rounded-2xl text-base placeholder:text-black focus-visible:ring-1 focus-visible:ring-black/10 resize-none"
              />

              <PlasticButton
                text="Extract Order Details"
                onClick={extractOrderFromText}
                loading={extracting}
                loadingText="Extracting..."
                className="w-full px-6 h-14"
              />
            </div>

            {/* Product Catalog (read-only — manage on Products page) */}
            {isAdmin && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-black"></div>
                    <h3 className="text-sm font-bold uppercase tracking-widest">Product Management</h3>
                  </div>
                  <Link
                    to="/products"
                    className="flex items-center gap-1.5 text-[9px] font-medium tracking-[0.2em] uppercase text-black hover:text-black transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Manage in Products
                  </Link>
                </div>

                {/* Search and Sort */}
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-black" />
                    <Input
                      placeholder="Search products..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="pl-9 h-9 bg-[#F8F8F8] border-none rounded-xl text-sm"
                    />
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => toggleSort("name")}
                      className={`h-9 px-3 text-xs ${sortBy === "name" ? "bg-black/10 text-black" : "text-black hover:text-black"}`}>
                      Name <ArrowUpDown className="w-3 h-3 ml-1" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleSort("price")}
                      className={`h-9 px-3 text-xs ${sortBy === "price" ? "bg-black/10 text-black" : "text-black hover:text-black"}`}>
                      Price <ArrowUpDown className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </div>

                {/* Product list */}
                <div className="bg-white rounded-2xl border border-black/5 divide-y divide-black/5 max-h-[320px] overflow-y-auto">
                  {loadingProducts ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-4 h-4 animate-spin text-black" />
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="text-center py-8 space-y-2">
                      <Package className="w-8 h-8 text-black mx-auto" />
                      <p className="text-xs text-black font-medium">
                        {productSearch ? "No products match your search" : "No products in catalog yet"}
                      </p>
                      {!productSearch && (
                        <Link to="/products" className="inline-flex items-center gap-1 text-[9px] tracking-[0.2em] uppercase text-black hover:text-black transition-colors">
                          <ExternalLink className="w-2.5 h-2.5" /> Add products on the Products page
                        </Link>
                      )}
                    </div>
                  ) : (
                    filteredProducts.map((product) => (
                      <div key={product.id} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {product.image_url && (
                            <img src={product.image_url} alt={product.name}
                              className="h-8 w-8 rounded-lg object-cover shrink-0 border border-black/[0.04]" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-black truncate">{product.name}</p>
                            <p className="text-xs text-black">
                              {product.selling_price ? `৳${product.selling_price.toLocaleString()}` : "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </div>

          {/* Extracted Details Section */}
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-black"></div>
                <h3 className="text-sm font-bold uppercase tracking-widest">Extracted Details</h3>
              </div>
              <p className="text-xs text-black font-light">Review and edit extracted information before creating order</p>
            </div>

            {extractedOrder ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* Customer Info */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-black uppercase tracking-wider">Customer Name</label>
                    <Input
                      value={extractedOrder.customer_name}
                      onChange={(e) => updateExtractedOrder("customer_name", e.target.value)}
                      className="h-14 bg-[#F8F8F8] border-none rounded-2xl"
                      disabled={!manualEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-black uppercase tracking-wider">Phone Number</label>
                    <Input
                      value={extractedOrder.phone}
                      onChange={(e) => updateExtractedOrder("phone", e.target.value)}
                      className="h-14 bg-[#F8F8F8] border-none rounded-2xl"
                      disabled={!manualEdit}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-black uppercase tracking-wider">Delivery Address</label>
                  <Input
                    value={extractedOrder.address}
                    onChange={(e) => updateExtractedOrder("address", e.target.value)}
                    className="h-14 bg-[#F8F8F8] border-none rounded-2xl"
                    disabled={!manualEdit}
                  />
                </div>

                {/* Order Lines */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-black uppercase tracking-wider">Products</label>
                    <span className="text-[10px] text-black font-medium">
                      {orderLines.length} item{orderLines.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {orderLines.map((line) => (
                      <div key={line.id} className="flex items-center gap-3 bg-[#F8F8F8] rounded-2xl px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-black truncate">{line.name}</p>
                          <p className="text-xs text-black">৳{line.unitPrice.toLocaleString()} each</p>
                        </div>
                        {/* Qty toggle */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateLineQty(line.id, -1)}
                            className="h-7 w-7 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-colors"
                          >
                            <Minus className="w-3 h-3 text-black" />
                          </button>
                          <span className="w-6 text-center text-sm font-semibold text-black">{line.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateLineQty(line.id, 1)}
                            className="h-7 w-7 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-colors"
                          >
                            <Plus className="w-3 h-3 text-black" />
                          </button>
                        </div>
                        {/* Line total */}
                        <div className="text-sm font-semibold text-black shrink-0 w-20 text-right">
                          ৳{(line.unitPrice * line.quantity).toLocaleString()}
                        </div>
                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => removeOrderLine(line.id)}
                          className="h-7 w-7 rounded-full hover:bg-red-50 flex items-center justify-center transition-colors shrink-0 ml-1"
                        >
                          <X className="w-3.5 h-3.5 text-black hover:text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add product combobox */}
                  {products.length > 0 && (
                    <div className="flex items-center gap-2 pt-1">
                      <Combobox
                        items={products.map((p) => ({
                          value: p.id,
                          label: p.name,
                          price: p.selling_price ?? 0,
                        }))}
                        value={addProductId}
                        onValueChange={addProductLine}
                        placeholder="Add a product from catalog…"
                        emptyMessage="No products found."
                        showPrice={true}
                        className="flex-1"
                      />
                    </div>
                  )}
                  {products.length === 0 && (
                    <Link
                      to="/products"
                      className="inline-flex items-center gap-1 text-[9px] tracking-[0.2em] uppercase text-black hover:text-black transition-colors"
                    >
                      <ExternalLink className="w-2.5 h-2.5" /> Add products on the Products page
                    </Link>
                  )}
                </div>

                {/* Delivery + Total summary */}
                {(() => {
                  const subtotal = orderLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
                  const grand = subtotal + extractedOrder.delivery_charge;
                  return (
                    <div className="rounded-2xl border border-black/5 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-black/5">
                        <div className="flex items-center gap-2">
                          <Truck className="w-4 h-4 text-black" />
                          <span className="text-xs text-black">
                            Delivery
                            <span className="ml-1.5 text-black">
                              ({extractedOrder.location_type === "inside_dhaka" ? "Inside Dhaka" : "Outside Dhaka"})
                            </span>
                          </span>
                        </div>
                        <span className="text-sm font-medium text-black">৳{extractedOrder.delivery_charge}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3 bg-black/[0.02]">
                        <span className="text-xs font-bold uppercase tracking-widest text-black">Total</span>
                        <span className="text-xl font-bold text-black">৳{grand.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => setManualEdit(!manualEdit)}
                    className="flex-1 h-14 text-sm font-medium text-black hover:text-black hover:bg-black/[0.03] rounded-2xl"
                  >
                    {manualEdit ? "Lock Editing" : "Enable Editing"}
                  </Button>
                  <PlasticButton
                    text="Create Order"
                    onClick={createOrder}
                    loading={creating}
                    loadingText="Creating..."
                    className="flex-1 px-6 h-14"
                  />
                </div>
              </motion.div>
            ) : (
              <div className="text-center py-20 bg-white rounded-2xl border border-black/5">
                <Package className="w-12 h-12 text-black mx-auto mb-4" />
                <p className="text-[10px] text-black tracking-[0.2em] font-bold uppercase">No data extracted yet</p>
                <p className="text-xs text-black mt-2">Paste order text and click extract to begin</p>
              </div>
            )}
          </div>
        </motion.section>
      </main>
    </div>
  );
}
