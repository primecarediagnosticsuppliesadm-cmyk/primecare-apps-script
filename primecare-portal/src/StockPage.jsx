import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  Package,
  AlertTriangle,
  ShoppingCart,
  ClipboardCheck,
  Search,
  PlusCircle,
} from "lucide-react";

import { getStock } from "@/api/primecareApi";

const pieColors = ["#22c55e", "#f59e0b", "#ef4444"];

function statusPieData(stock) {
  const counts = [
    { name: "Healthy", value: stock.filter((s) => s.status === "Healthy").length },
    { name: "Reorder", value: stock.filter((s) => s.status === "Reorder").length },
    { name: "Critical", value: stock.filter((s) => s.status === "Critical").length },
  ];
  return counts.filter((c) => c.value > 0);
}

function demandData(stock) {
  return stock.map((s) => ({
    name: s.name,
    Demand: Number(s.avgDailySales || 0),
    Current: Number(s.currentStock || 0),
  }));
}

function StatCard({ title, value, icon: Icon, subtitle }) {
  return (
    <Card className="rounded-2xl shadow-sm border-slate-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">{title}</p>
            <h3 className="text-2xl font-bold mt-1 text-slate-900">{value}</h3>
            <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
          </div>
          <div className="rounded-2xl p-3 bg-slate-50">
            <Icon className="w-5 h-5 text-slate-700" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function mapApiStockItem(item) {
  const healthRaw = String(item.stockHealth || item.status || "Healthy").toLowerCase();

  let status = "Healthy";
  if (healthRaw.includes("critical")) status = "Critical";
  else if (healthRaw.includes("reorder") || healthRaw.includes("low")) status = "Reorder";

  return {
    id: item.productId || "",
    name: item.productName || "",
    category: item.category || "",
    currentStock: Number(item.currentStock || 0),
    minStock: Number(item.minStock || 0),
    reorderQty: Number(item.reorderQty || 0),
    avgDailySales: Number(item.avgDailySales || 0),
    status,
  };
}

export default function StockPage() {
  const [stock, setStock] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newItem, setNewItem] = useState({
    name: "",
    category: "Consumables",
    current: "",
    min: "",
    reorderQty: "",
    monthlyDemand: "",
  });

  useEffect(() => {
    async function loadStock() {
      try {
        const res = await getStock();
        if (!res.success) throw new Error(res.error || "Failed to load stock");

        const rows = (res.data?.inventory || []).map(mapApiStockItem);
        setStock(rows);
      } catch (err) {
        setError(err.message || "Failed to load stock");
      } finally {
        setLoading(false);
      }
    }

    loadStock();
  }, []);

  const filtered = useMemo(() => {
    return stock.filter(
      (item) =>
        item.name.toLowerCase().includes(query.toLowerCase()) ||
        item.category.toLowerCase().includes(query.toLowerCase()) ||
        item.id.toLowerCase().includes(query.toLowerCase())
    );
  }, [stock, query]);

  const stats = useMemo(() => {
    const critical = stock.filter((s) => s.status === "Critical").length;
    const reorder = stock.filter((s) => s.status === "Reorder").length;
    const totalToOrder = stock.reduce(
      (sum, s) => sum + (s.status !== "Healthy" ? Number(s.reorderQty || 0) : 0),
      0
    );
    return { critical, reorder, totalToOrder, totalSkus: stock.length };
  }, [stock]);

  const addStockItem = () => {
    if (!newItem.name || !newItem.current || !newItem.min || !newItem.monthlyDemand) return;

    const currentStock = Number(newItem.current);
    const minStock = Number(newItem.min);
    const reorderQty = Number(newItem.reorderQty || 0);
    const avgDailySales = Number(newItem.monthlyDemand);
    const status = currentStock <= minStock * 0.5 ? "Critical" : currentStock < minStock ? "Reorder" : "Healthy";

    setStock((prev) => [
      {
        id: `TEMP-${prev.length + 1}`,
        name: newItem.name,
        category: newItem.category,
        currentStock,
        minStock,
        reorderQty,
        avgDailySales,
        status,
      },
      ...prev,
    ]);

    setNewItem({
      name: "",
      category: "Consumables",
      current: "",
      min: "",
      reorderQty: "",
      monthlyDemand: "",
    });
  };

  if (loading) {
    return <div className="p-4 text-slate-600">Loading stock dashboard...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-4 gap-4">
        <StatCard title="Total SKUs" value={stats.totalSkus} icon={Package} subtitle="Tracked in stock register" />
        <StatCard title="Critical SKUs" value={stats.critical} icon={AlertTriangle} subtitle="Need immediate action" />
        <StatCard title="Reorder SKUs" value={stats.reorder} icon={ShoppingCart} subtitle="Below target stock" />
        <StatCard title="Order Qty" value={stats.totalToOrder} icon={ClipboardCheck} subtitle="Suggested reorder units" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="rounded-2xl lg:col-span-1">
          <CardHeader>
            <CardTitle>Stock Health Mix</CardTitle>
            <CardDescription>Healthy, reorder, and critical split</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusPieData(stock)} dataKey="value" nameKey="name" outerRadius={90} label>
                  {statusPieData(stock).map((entry, index) => (
                    <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader>
            <CardTitle>Demand vs Current Stock</CardTitle>
            <CardDescription>See pressure points before stockouts happen</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={demandData(stock)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="Current" />
                <Bar dataKey="Demand" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader>
            <CardTitle>Current Stock and Reorder Suggestions</CardTitle>
            <CardDescription>Search by product or category</CardDescription>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search stock items..."
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filtered.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  className="border rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{item.name}</div>
                    <div className="text-sm text-slate-500">
                      {item.category} • SKU {item.id}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center text-sm">
                    <Badge variant="secondary">Current: {item.currentStock}</Badge>
                    <Badge variant="secondary">Min: {item.minStock}</Badge>
                    <Badge variant="secondary">Demand: {item.avgDailySales}</Badge>
                    <Badge>{item.status}</Badge>
                    {item.status !== "Healthy" && (
                      <Badge variant="destructive">Order {item.reorderQty}</Badge>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Add / Update Stock Item</CardTitle>
            <CardDescription>Quick intake planning form</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Product name" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
            <Select value={newItem.category} onValueChange={(value) => setNewItem({ ...newItem, category: value })}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Consumables">Consumables</SelectItem>
                <SelectItem value="Vacutainers">Vacutainers</SelectItem>
                <SelectItem value="Reagents">Reagents</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Current stock" value={newItem.current} onChange={(e) => setNewItem({ ...newItem, current: e.target.value })} />
            <Input placeholder="Minimum stock" value={newItem.min} onChange={(e) => setNewItem({ ...newItem, min: e.target.value })} />
            <Input placeholder="Suggested reorder qty" value={newItem.reorderQty} onChange={(e) => setNewItem({ ...newItem, reorderQty: e.target.value })} />
            <Input placeholder="Monthly demand" value={newItem.monthlyDemand} onChange={(e) => setNewItem({ ...newItem, monthlyDemand: e.target.value })} />
            <Button className="w-full" onClick={addStockItem}>
              <PlusCircle className="w-4 h-4 mr-2" />
              Add Stock Item
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}