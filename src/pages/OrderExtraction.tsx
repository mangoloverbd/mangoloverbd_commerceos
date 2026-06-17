import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { motion } from "framer-motion";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Button as BaseButton } from "@/components/base/buttons/button";
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
  Truck,
  CheckCircle2,
  Package,
  Search,
  ArrowUpDown,
  ExternalLink,
  Plus,
  Minus,
  X,
  Sparkles,
  Lock,
  Unlock,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { Spinner } from "@/components/ui/ios-spinner";
import { AnimatedText } from "@/components/ui/animated-text";

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
      const res = await apiFetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to create order");

      toast.custom(() => (
        <div className="flex min-w-[300px] items-center gap-4 rounded-2xl border border-black/10 bg-white p-4 shadow-xl">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-500/10">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Order Created</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-semibold text-foreground">{extractedOrder.customer_name}</span>
              <span className="text-xs font-medium text-muted-foreground">added to dashboard</span>
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
    <div className="min-h-full">
      <main className="mx-auto max-w-[1800px] space-y-6 p-1 lg:p-2">
        <motion.section
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="grid gap-6 lg:grid-cols-2"
        >
          {/* Input Section */}
          <div className="space-y-6">
            <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
              <div className="flex h-[50px] items-center justify-between border-b border-black/10 px-6">
                <div className="flex items-center gap-2.5">
                  <Package className="h-3.5 w-3.5 text-muted-foreground" />
                  <AnimatedText as="h3" className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Order Text Input</AnimatedText>
                </div>
                <span className="text-[13px] text-muted-foreground">AI extraction</span>
              </div>

              <div className="space-y-4 px-6 py-5">
                <p className="text-sm text-muted-foreground">Paste the complete order text from messenger or social media.</p>
                <Textarea
                  placeholder="Paste the order message here... Example: 'Hi, I want to order 2 t-shirts. My name is Rahim, phone: 01712345678, address: House 12, Road 5, Dhanmondi, Dhaka'"
                  value={orderText}
                  onChange={(e) => setOrderText(e.target.value)}
                  className="min-h-[220px] resize-none rounded-xl border-0 bg-black/[0.06] text-sm text-foreground shadow-none placeholder:text-black/35 focus-visible:ring-1 focus-visible:ring-black/20"
                />

                <BaseButton
                    color="skeuomorphic"
                    size="md"
                    onClick={extractOrderFromText}
                    isLoading={extracting}
                    showTextWhileLoading
                    disabled={extracting || !orderText.trim()}
                    iconLeading={<Sparkles />}
                    className="w-full"
                  >
                    {extracting ? "Extracting..." : "Extract Order Details"}
                  </BaseButton>
              </div>
            </div>

            {/* Product Catalog (read-only — manage on Products page) */}
            {isAdmin && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="overflow-hidden rounded-2xl border border-black/10 bg-white"
              >
                <div className="flex h-[50px] items-center justify-between border-b border-black/10 px-6">
                  <div className="flex items-center gap-2.5">
                    <Package className="h-3.5 w-3.5 text-muted-foreground" />
                    <AnimatedText as="h3" className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Product Management</AnimatedText>
                  </div>
                  <Link
                    to="/products"
                    className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Manage
                  </Link>
                </div>

                {/* Search and Sort */}
                <div className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search products..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="h-9 rounded-xl border-0 bg-black/[0.06] pl-9 text-sm shadow-none placeholder:text-black/35 focus-visible:ring-1 focus-visible:ring-black/20"
                    />
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => toggleSort("name")}
                      className={`h-9 rounded-xl px-3 text-xs ${sortBy === "name" ? "bg-black/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                      Name <ArrowUpDown className="w-3 h-3 ml-1" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleSort("price")}
                      className={`h-9 rounded-xl px-3 text-xs ${sortBy === "price" ? "bg-black/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                      Price <ArrowUpDown className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </div>

                {/* Product list */}
                <div className="max-h-[320px] overflow-y-auto border-t border-black/10">
                  {loadingProducts ? (
                    <div className="flex items-center justify-center py-8">
                      <Spinner className="text-muted-foreground" />
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="text-center py-8 space-y-2">
                      <Package className="mx-auto h-8 w-8 text-black/15" />
                      <p className="text-sm font-medium text-foreground">
                        {productSearch ? "No products match your search" : "No products in catalog yet"}
                      </p>
                      {!productSearch && (
                        <Link to="/products" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                          <ExternalLink className="w-2.5 h-2.5" /> Add products on the Products page
                        </Link>
                      )}
                    </div>
                  ) : (
                    filteredProducts.map((product) => (
                      <div key={product.id} className="flex items-center justify-between border-b border-black/[0.06] px-6 py-3 last:border-0">
                        <div className="flex items-center gap-3 min-w-0">
                          {product.image_url && (
                            <img src={product.image_url} alt={product.name}
                              className="h-8 w-8 rounded-lg object-cover shrink-0 border border-black/[0.04]" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                            <p className="text-xs text-muted-foreground">
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
          <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
            <div className="flex h-[50px] items-center justify-between border-b border-black/10 px-6">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                <AnimatedText as="h3" className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Extracted Details</AnimatedText>
              </div>
              <span className="text-[13px] text-muted-foreground">Review before creating</span>
            </div>

            <div className="p-6">
              {extractedOrder ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-5"
                >
                {/* Customer Info */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Customer Name</label>
                    <Input
                      value={extractedOrder.customer_name}
                      onChange={(e) => updateExtractedOrder("customer_name", e.target.value)}
                      className="h-10 rounded-xl border-0 bg-black/[0.06] text-sm shadow-none focus-visible:ring-1 focus-visible:ring-black/20"
                      disabled={!manualEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Phone Number</label>
                    <Input
                      value={extractedOrder.phone}
                      onChange={(e) => updateExtractedOrder("phone", e.target.value)}
                      className="h-10 rounded-xl border-0 bg-black/[0.06] text-sm shadow-none focus-visible:ring-1 focus-visible:ring-black/20"
                      disabled={!manualEdit}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Delivery Address</label>
                  <Input
                    value={extractedOrder.address}
                    onChange={(e) => updateExtractedOrder("address", e.target.value)}
                    className="h-10 rounded-xl border-0 bg-black/[0.06] text-sm shadow-none focus-visible:ring-1 focus-visible:ring-black/20"
                    disabled={!manualEdit}
                  />
                </div>

                {/* Order Lines */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Products</label>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {orderLines.length} item{orderLines.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {orderLines.map((line) => (
                      <div key={line.id} className="flex items-center gap-3 rounded-xl bg-black/[0.045] px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{line.name}</p>
                          <p className="text-xs text-muted-foreground">৳{line.unitPrice.toLocaleString()} each</p>
                        </div>
                        {/* Qty toggle */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateLineQty(line.id, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/5 transition-colors hover:bg-black/10"
                          >
                            <Minus className="h-3 w-3 text-foreground" />
                          </button>
                          <span className="w-6 text-center text-sm font-semibold text-foreground">{line.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateLineQty(line.id, 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/5 transition-colors hover:bg-black/10"
                          >
                            <Plus className="h-3 w-3 text-foreground" />
                          </button>
                        </div>
                        {/* Line total */}
                        <div className="w-20 shrink-0 text-right text-sm font-semibold text-foreground">
                          ৳{(line.unitPrice * line.quantity).toLocaleString()}
                        </div>
                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => removeOrderLine(line.id)}
                          className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-red-50"
                        >
                          <X className="h-3.5 w-3.5 text-muted-foreground hover:text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add product combobox */}
                  {products.length > 0 && (
                    <div className="flex items-center gap-2 pt-1 [&_button]:rounded-xl [&_button]:border-0 [&_button]:bg-black/[0.06]">
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
                      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
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
                    <div className="overflow-hidden rounded-2xl border border-black/10 bg-black/[0.025]">
                      <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs text-foreground">
                            Delivery
                            <span className="ml-1.5 text-muted-foreground">
                              ({extractedOrder.location_type === "inside_dhaka" ? "Inside Dhaka" : "Outside Dhaka"})
                            </span>
                          </span>
                        </div>
                        <span className="text-sm font-medium text-foreground">৳{extractedOrder.delivery_charge}</span>
                      </div>
                      <div className="flex items-center justify-between bg-black/[0.035] px-4 py-3">
                        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Total</span>
                        <span className="text-xl font-bold text-foreground">৳{grand.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex gap-3">
                  <BaseButton
                    color="skeuomorphic"
                    size="md"
                    onClick={() => setManualEdit(!manualEdit)}
                    iconLeading={manualEdit ? <Lock /> : <Unlock />}
                    className="min-w-0 flex-1"
                  >
                    {manualEdit ? "Lock Editing" : "Enable Editing"}
                  </BaseButton>
                  <BaseButton
                    color="skeuomorphic"
                    size="md"
                    onClick={createOrder}
                    isLoading={creating}
                    showTextWhileLoading
                    disabled={creating}
                    iconLeading={<Plus />}
                    className="min-w-0 flex-1"
                  >
                    {creating ? "Creating..." : "Create Order"}
                  </BaseButton>
                </div>
              </motion.div>
            ) : (
              <div className="rounded-2xl border border-black/10 bg-black/[0.025] py-20 text-center">
                <Package className="mx-auto mb-4 h-12 w-12 text-black/15" />
                <p className="text-sm font-semibold text-foreground">No data extracted yet</p>
                <p className="mt-2 text-sm text-muted-foreground">Paste order text and click extract to begin</p>
              </div>
            )}
            </div>
          </div>
        </motion.section>
      </main>
    </div>
  );
}
