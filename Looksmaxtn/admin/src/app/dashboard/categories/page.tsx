"use client";

import { useEffect, useMemo, useState } from "react";
import { withAuthRequest } from "@/lib/authClient";

interface Category {
  _id: string;
  name: string;
  slug: string;
  order: number;
  isActive: boolean;
  parentSlug?: string | null;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: { id: string; name: string; email: string } | null;
  updatedBy?: { id: string; name: string; email: string } | null;
}

type SortKey = "order" | "name" | "parent" | "slug" | "visibility" | "created" | "updated";
type SortDirection = "asc" | "desc";

function formatAuditLine(date?: string, actor?: { name: string; email: string } | null) {
  const actorLabel = actor?.name || actor?.email || "—";
  if (!date) return actorLabel;
  const parsed = new Date(date);
  const dateLabel = Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString();
  return `${actorLabel} · ${dateLabel}`;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", order: "0", isActive: true, parentSlug: "" });
  const [saving, setSaving] = useState(false);
  const [togglingVisibilityId, setTogglingVisibilityId] = useState("");
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("order");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const fetchCategories = () => {
    fetch("/api/categories", withAuthRequest())
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCategories(); }, []);

  const resetForm = () => {
    setForm({ name: "", slug: "", order: "0", isActive: true, parentSlug: "" });
    setEditingId(null);
    setShowForm(false);
    setError("");
  };

  const startEdit = (cat: Category) => {
    setForm({
      name: cat.name,
      slug: cat.slug,
      order: cat.order.toString(),
      isActive: cat.isActive,
      parentSlug: cat.parentSlug || "",
    });
    setEditingId(cat._id);
    setShowForm(true);
    setError("");
  };

  const handleNameChange = (name: string) => {
    setForm({
      ...form,
      name,
      slug: editingId ? form.slug : name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    const body = {
      name: form.name,
      slug: form.slug,
      order: parseInt(form.order) || 0,
      isActive: form.isActive,
      parentSlug: form.parentSlug || null,
    };

    try {
      const url = editingId ? `/api/categories/${editingId}` : "/api/categories";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, withAuthRequest({
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }));

      const data = await res.json();
      if (!res.ok) { setError(data.error); setSaving(false); return; }

      resetForm();
      fetchCategories();
    } catch {
      setError("Network error");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete category "${name}"?`)) return;
    await fetch(`/api/categories/${id}`, withAuthRequest({ method: "DELETE" }));
    setCategories((c) => c.filter((x) => x._id !== id));
  };

  const toggleActive = async (cat: Category) => {
    setTogglingVisibilityId(cat._id);
    try {
      const res = await fetch(`/api/categories/${cat._id}`, withAuthRequest({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !cat.isActive }),
      }));
      if (res.ok) {
        fetchCategories();
      }
    } finally {
      setTogglingVisibilityId("");
    }
  };

  const normalizedSearch = search.trim().toLowerCase();
  const availableParentCategories = categories.filter((cat) => !editingId || cat._id !== editingId);
  const getCategoryPath = (category: Category) => {
    const segments = [category.name];
    let currentParentSlug = category.parentSlug;

    while (currentParentSlug) {
      const parent = categories.find((cat) => cat.slug === currentParentSlug);
      if (!parent) break;
      segments.unshift(parent.name);
      currentParentSlug = parent.parentSlug || null;
    }

    return segments.join(" / ");
  };
  const getParentName = (parentSlug?: string | null) =>
    categories.find((cat) => cat.slug === parentSlug)?.name || "Top level";
  const depthBySlug = useMemo(() => {
    const bySlug = new Map(categories.map((c) => [c.slug, c]));
    const cache = new Map<string, number>();
    const compute = (cat: Category): number => {
      const cached = cache.get(cat.slug);
      if (cached !== undefined) return cached;
      if (!cat.parentSlug) { cache.set(cat.slug, 0); return 0; }
      const parent = bySlug.get(cat.parentSlug);
      const depth = parent ? compute(parent) + 1 : 0;
      cache.set(cat.slug, depth);
      return depth;
    };
    for (const c of categories) compute(c);
    return cache;
  }, [categories]);

  const treeOrdered = useMemo(() => {
    const childrenOf = new Map<string | null, Category[]>();
    for (const c of categories) {
      const key = c.parentSlug || null;
      if (!childrenOf.has(key)) childrenOf.set(key, []);
      childrenOf.get(key)!.push(c);
    }
    for (const arr of childrenOf.values()) {
      arr.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    }
    const out: Category[] = [];
    const walk = (parentSlug: string | null) => {
      for (const c of childrenOf.get(parentSlug) || []) {
        out.push(c);
        walk(c.slug);
      }
    };
    walk(null);
    return out;
  }, [categories]);

  const useTreeView = sortKey === "order" && !normalizedSearch;

  const hasChildrenSet = useMemo(() => {
    const s = new Set<string>();
    for (const c of categories) if (c.parentSlug) s.add(c.parentSlug);
    return s;
  }, [categories]);

  const ancestorsOf = useMemo(() => {
    const bySlug = new Map(categories.map((c) => [c.slug, c]));
    const cache = new Map<string, string[]>();
    const compute = (slug: string): string[] => {
      const cached = cache.get(slug);
      if (cached) return cached;
      const cat = bySlug.get(slug);
      if (!cat || !cat.parentSlug) { cache.set(slug, []); return []; }
      const list = [cat.parentSlug, ...compute(cat.parentSlug)];
      cache.set(slug, list);
      return list;
    };
    for (const c of categories) compute(c.slug);
    return cache;
  }, [categories]);

  const toggleCollapsed = (slug: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  };

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () =>
    setCollapsed(new Set(categories.filter((c) => hasChildrenSet.has(c.slug)).map((c) => c.slug)));

  const filteredCategories = useMemo(() => {
    if (useTreeView) {
      const visible = treeOrdered.filter((cat) => {
        const ancestors = ancestorsOf.get(cat.slug) || [];
        return !ancestors.some((a) => collapsed.has(a));
      });
      return sortDirection === "asc" ? visible : [...visible].reverse();
    }

    const next = normalizedSearch
      ? categories.filter((cat) =>
          [cat.name, cat.slug, cat.parentSlug || "", String(cat.order)].some((value) =>
            value.toLowerCase().includes(normalizedSearch)
          )
        )
      : categories;

    const getSortableValue = (category: Category) => {
      switch (sortKey) {
        case "order":
          return category.order;
        case "name":
          return category.name;
        case "parent":
          return getParentName(category.parentSlug);
        case "slug":
          return category.slug;
        case "visibility":
          return category.isActive ? "active" : "inactive";
        case "created":
          return category.createdAt || "";
        case "updated":
          return category.updatedAt || "";
        default:
          return category.order;
      }
    };

    return [...next].sort((a, b) => {
      const left = getSortableValue(a);
      const right = getSortableValue(b);
      const comparison =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [ancestorsOf, categories, collapsed, getParentName, normalizedSearch, sortDirection, sortKey, treeOrdered, useTreeView]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  };

  const renderSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return <span className="text-[9px] text-text-secondary/60">↕</span>;
    return <span className="text-[9px] text-accent">{sortDirection === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold tracking-wide">Categories</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="inline-flex w-full justify-center bg-text-primary text-bg-primary px-4 py-2 text-xs font-semibold tracking-wide uppercase hover:bg-accent transition-colors cursor-pointer sm:w-auto"
        >
          + Add Category
        </button>
      </div>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search categories by name, slug, or order..."
          className="flex-1 bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-text-primary transition-colors"
        />
        {useTreeView && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={expandAll}
              className="border border-border px-3 py-2 text-[10px] uppercase tracking-wider text-text-secondary hover:bg-bg-hover transition-colors cursor-pointer"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="border border-border px-3 py-2 text-[10px] uppercase tracking-wider text-text-secondary hover:bg-bg-hover transition-colors cursor-pointer"
            >
              Collapse all
            </button>
          </div>
        )}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-bg-card border border-border rounded p-5 mb-6">
          <h2 className="text-sm font-semibold mb-4">
            {editingId ? "Edit Category" : "New Category"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="border border-[#BD3100] bg-[#faf3f2] px-4 py-3 text-xs text-[#BD3100]">
                {error}
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div>
                <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                  Name
                </label>
                <input
                  type="text" required value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="input-line"
                  placeholder="T-Shirts"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                  Slug
                </label>
                <input
                  type="text" required value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  className="input-line"
                  placeholder="t-shirts"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                  Display Order
                </label>
                <input
                  type="number" value={form.order}
                  onChange={(e) => setForm({ ...form, order: e.target.value })}
                  className="input-line"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                  Parent Category
                </label>
                <select
                  value={form.parentSlug}
                  onChange={(e) => setForm({ ...form, parentSlug: e.target.value })}
                  className="input-line"
                >
                  <option value="">Top level</option>
                  {availableParentCategories.map((cat) => (
                      <option key={cat._id} value={cat.slug}>
                        {getCategoryPath(cat)}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox" checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="accent-accent"
                />
                Active (visible on store)
              </label>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={saving}
                className="bg-text-primary text-bg-primary px-6 py-2.5 text-xs font-semibold tracking-wide uppercase hover:bg-accent transition-colors cursor-pointer disabled:opacity-50">
                {saving ? "Saving..." : editingId ? "Update" : "Create"}
              </button>
              <button type="button" onClick={resetForm}
                className="border border-border px-6 py-2.5 text-xs text-text-secondary uppercase tracking-wider hover:bg-bg-hover transition-colors cursor-pointer">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Categories table */}
      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading...</p>
      ) : filteredCategories.length === 0 ? (
        <div className="border border-border border-dashed p-8 text-center rounded">
          <p className="text-sm text-text-secondary">
            {search ? "No categories match your search" : "No categories yet"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded">
          <table className="min-w-[920px] w-full text-left">
            <thead className="bg-bg-secondary">
              <tr className="text-[10px] text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("order")} className="inline-flex items-center gap-1 cursor-pointer">
                    Order {renderSortIndicator("order")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 cursor-pointer">
                    Name {renderSortIndicator("name")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("parent")} className="inline-flex items-center gap-1 cursor-pointer">
                    Parent {renderSortIndicator("parent")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("slug")} className="inline-flex items-center gap-1 cursor-pointer">
                    Slug {renderSortIndicator("slug")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("visibility")} className="inline-flex items-center gap-1 cursor-pointer">
                    Visibility {renderSortIndicator("visibility")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("created")} className="inline-flex items-center gap-1 cursor-pointer">
                    Created {renderSortIndicator("created")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("updated")} className="inline-flex items-center gap-1 cursor-pointer">
                    Updated {renderSortIndicator("updated")}
                  </button>
                </th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCategories.map((cat) => (
                <tr key={cat._id} className="hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3 text-xs text-text-secondary font-mono">{cat.order}</td>
                  <td className="px-4 py-3 text-xs font-medium">
                    {useTreeView ? (
                      (() => {
                        const depth = depthBySlug.get(cat.slug) ?? 0;
                        const hasKids = hasChildrenSet.has(cat.slug);
                        const isCollapsed = collapsed.has(cat.slug);
                        return (
                          <span className="inline-flex items-center">
                            <span style={{ width: `${depth * 16}px` }} aria-hidden="true" />
                            {hasKids ? (
                              <button
                                type="button"
                                onClick={() => toggleCollapsed(cat.slug)}
                                aria-label={isCollapsed ? `Expand ${cat.name}` : `Collapse ${cat.name}`}
                                className="mr-1.5 inline-flex h-4 w-4 items-center justify-center text-text-secondary hover:text-text-primary cursor-pointer"
                              >
                                <span className="text-[10px]">{isCollapsed ? "▶" : "▼"}</span>
                              </button>
                            ) : (
                              <span className="mr-1.5 inline-block h-4 w-4" aria-hidden="true" />
                            )}
                            <span>{cat.name}</span>
                          </span>
                        );
                      })()
                    ) : (
                      cat.name
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">{getParentName(cat.parentSlug)}</td>
                  <td className="px-4 py-3 text-xs text-text-secondary font-mono">{cat.slug}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void toggleActive(cat)}
                      disabled={togglingVisibilityId === cat._id}
                      className={`group relative inline-flex h-6 w-12 items-center transition-opacity ${
                        togglingVisibilityId === cat._id ? "opacity-60" : ""
                      }`}
                      aria-label={`Toggle visibility for ${cat.name}`}
                    >
                      <span
                        className={`absolute inset-0 rounded-full transition-colors ${
                          cat.isActive ? "bg-[#d7c08c]" : "bg-bg-secondary"
                        }`}
                      />
                      <span
                        className={`absolute top-[2px] h-5 w-5 rounded-full bg-bg-primary shadow-sm ring-1 ring-black/5 transition-all duration-200 ease-out ${
                          cat.isActive ? "left-[26px]" : "left-[2px]"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">{formatAuditLine(cat.createdAt, cat.createdBy)}</td>
                  <td className="px-4 py-3 text-xs text-text-secondary">{formatAuditLine(cat.updatedAt, cat.updatedBy)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => startEdit(cat)}
                        className="text-[10px] text-info hover:text-info/80 transition-colors uppercase font-medium cursor-pointer">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(cat._id, cat.name)}
                        className="text-[10px] text-danger hover:text-danger/80 transition-colors uppercase font-medium cursor-pointer">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
