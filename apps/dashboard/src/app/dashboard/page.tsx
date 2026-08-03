"use client";

import type {
  CreateProductInput,
  Product,
  UpdateProductInput,
} from "@mentionish/types";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  ProductApiError,
  createProduct,
  deleteProduct,
  listProducts,
  parseKeywordInput,
  updateProduct,
} from "../../lib/products-api";
import { createBrowserSupabaseClient } from "../../lib/supabase";

interface ProductFormState {
  name: string;
  description: string;
  keywords: string;
  voicePersona: string;
}

const emptyForm: ProductFormState = {
  name: "",
  description: "",
  keywords: "",
  voicePersona: "",
};

function formFromProduct(product: Product): ProductFormState {
  return {
    name: product.name,
    description: product.description,
    keywords: product.keywords.join("\n"),
    voicePersona: product.voice_persona ?? "",
  };
}

function messageFor(error: unknown): string {
  if (error instanceof ProductApiError) {
    if (error.code === "PRODUCT_LIMIT_REACHED") {
      return "Your current plan has reached its active product limit. Edit or remove an existing product before adding another.";
    }
    if (error.code === "KEYWORD_LIMIT_REACHED") {
      return "This product has more keywords than your plan allows. Remove a few and try again.";
    }
    if (error.status === 401) {
      return "Your session expired. Sign in again to continue.";
    }
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : "We could not complete that request. Please try again.";
}

function initials(email: string | null): string {
  return (email?.trim().charAt(0) || "M").toUpperCase();
}

export default function DashboardPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<"save" | "delete" | "reload" | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let active = true;

    async function loadWorkspace() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        router.replace("/");
        return;
      }

      if (!active) return;
      setAccessToken(session.access_token);
      setEmail(session.user.email ?? "your account");

      try {
        const loadedProducts = await listProducts(session.access_token);
        if (!active) return;
        setProducts(loadedProducts);
        setFormOpen(loadedProducts.length === 0);
      } catch (caught) {
        if (active) setLoadError(messageFor(caught));
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadWorkspace();
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT" || !session) {
          router.replace("/");
          return;
        }
        setAccessToken(session.access_token);
      },
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [router]);

  const keywords = parseKeywordInput(form.keywords);
  const keywordCount = products.reduce(
    (total, product) => total + product.keywords.length,
    0,
  );

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setStep(1);
    setFormError(null);
    setNotice(null);
    setFormOpen(true);
  }

  function openEdit(product: Product) {
    setEditingId(product.id);
    setForm(formFromProduct(product));
    setStep(1);
    setFormError(null);
    setNotice(null);
    setFormOpen(true);
  }

  function closeForm() {
    if (pending === "save") return;
    setFormOpen(false);
    setFormError(null);
  }

  function validateStep(currentStep: number): string | null {
    if (currentStep === 1) {
      if (!form.name.trim()) return "Enter a product name.";
      if (!form.description.trim()) {
        return "Describe the problem your product solves.";
      }
    }
    if (currentStep === 2) {
      if (keywords.length === 0) return "Add at least one listening phrase.";
      if (new Set(keywords).size !== keywords.length) {
        return "Remove duplicate listening phrases before continuing.";
      }
      if (keywords.some((keyword) => keyword.length < 2)) {
        return "Each listening phrase must contain at least two characters.";
      }
      if (keywords.some((keyword) => keyword.length > 80)) {
        return "Each listening phrase must be 80 characters or fewer.";
      }
      if (keywords.length > 25) {
        return "Use no more than 25 listening phrases.";
      }
    }
    return null;
  }

  function continueForm() {
    const validationError = validateStep(step);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    setStep((current) => Math.min(3, current + 1));
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || step !== 3) return;

    const validationError = validateStep(1) ?? validateStep(2);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const input: CreateProductInput = {
      name: form.name.trim(),
      description: form.description.trim(),
      keywords,
      voice_persona: form.voicePersona.trim() || null,
    };

    setPending("save");
    setFormError(null);
    setNotice(null);
    try {
      if (editingId) {
        const update: UpdateProductInput = input;
        const saved = await updateProduct(accessToken, editingId, update);
        setProducts((current) =>
          current.map((product) => (product.id === saved.id ? saved : product)),
        );
        setNotice(saved.name + " was updated.");
      } else {
        const saved = await createProduct(accessToken, input);
        setProducts((current) => [...current, saved]);
        setNotice(saved.name + " is ready for discovery.");
      }
      setFormOpen(false);
    } catch (caught) {
      setFormError(messageFor(caught));
    } finally {
      setPending(null);
    }
  }

  async function reloadProducts() {
    if (!accessToken) return;
    setPending("reload");
    setLoadError(null);
    try {
      setProducts(await listProducts(accessToken));
    } catch (caught) {
      setLoadError(messageFor(caught));
    } finally {
      setPending(null);
    }
  }

  async function removeProduct(product: Product) {
    if (!accessToken) return;
    const confirmed = window.confirm(
      "Remove " +
        product.name +
        "? Discovery for it will stop, but existing records remain protected.",
    );
    if (!confirmed) return;

    setPending("delete");
    setLoadError(null);
    setNotice(null);
    try {
      await deleteProduct(accessToken, product.id);
      setProducts((current) =>
        current.filter((candidate) => candidate.id !== product.id),
      );
      setNotice(product.name + " was removed.");
    } catch (caught) {
      setLoadError(messageFor(caught));
    } finally {
      setPending(null);
    }
  }

  async function signOut() {
    await createBrowserSupabaseClient().auth.signOut();
    router.replace("/");
  }

  if (loading) {
    return (
      <main className="app-loading" aria-busy="true">
        <span className="loading-mark">M</span>
        <p>Preparing your workspace...</p>
      </main>
    );
  }

  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">M</span>
          <span>Mentionish</span>
        </div>

        <nav className="sidebar-nav" aria-label="Workspace">
          <p className="nav-label">Workspace</p>
          <span className="nav-item">
            <span className="nav-glyph" aria-hidden="true">
              O
            </span>
            Overview
            <span className="soon-label">Soon</span>
          </span>
          <a
            className="nav-item nav-item-active"
            href="/dashboard"
            aria-current="page"
          >
            <span className="nav-glyph" aria-hidden="true">
              P
            </span>
            Products
          </a>
          <span className="nav-item">
            <span className="nav-glyph" aria-hidden="true">
              C
            </span>
            Conversations
            <span className="soon-label">Soon</span>
          </span>
          <span className="nav-item">
            <span className="nav-glyph" aria-hidden="true">
              A
            </span>
            Analytics
            <span className="soon-label">Soon</span>
          </span>

          <p className="nav-label nav-label-spaced">Account</p>
          <span className="nav-item">
            <span className="nav-glyph" aria-hidden="true">
              S
            </span>
            Settings
            <span className="soon-label">Soon</span>
          </span>
        </nav>

        <div className="source-health">
          <div className="source-health-heading">
            <span className="health-dot" />
            Discovery status
          </div>
          <p>Hacker News is ready</p>
          <span>Reddit awaits credentials</span>
        </div>

        <div className="sidebar-account">
          <span className="avatar">{initials(email)}</span>
          <div>
            <strong>{email}</strong>
            <span>Free workspace</span>
          </div>
          <button
            type="button"
            aria-label="Sign out"
            onClick={() => void signOut()}
          >
            Exit
          </button>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-topbar">
          <div>
            <p className="page-kicker">Workspace</p>
            <h1>Products</h1>
          </div>
          <button className="primary-action" type="button" onClick={openCreate}>
            <span aria-hidden="true">+</span>
            New product
          </button>
        </header>

        <div className="app-content">
          {loadError ? (
            <section className="notice-banner notice-error" role="alert">
              <div>
                <strong>We could not load your products</strong>
                <p>{loadError}</p>
              </div>
              <button
                className="secondary-action"
                type="button"
                disabled={pending === "reload"}
                onClick={() => void reloadProducts()}
              >
                {pending === "reload" ? "Retrying..." : "Try again"}
              </button>
            </section>
          ) : null}

          {notice ? (
            <p className="notice-banner notice-success" role="status">
              {notice}
            </p>
          ) : null}

          <section className="metrics-grid" aria-label="Workspace summary">
            <article className="metric-card">
              <span>Active products</span>
              <strong>{products.length}</strong>
              <p>Products currently being monitored</p>
            </article>
            <article className="metric-card">
              <span>Listening phrases</span>
              <strong>{keywordCount}</strong>
              <p>Keywords and customer phrases tracked</p>
            </article>
            <article className="metric-card">
              <span>Discovery sources</span>
              <strong>1 of 2</strong>
              <p>Hacker News ready, Reddit safely paused</p>
            </article>
          </section>

          <section className="products-panel" aria-labelledby="products-title">
            <div className="panel-heading">
              <div>
                <h2 id="products-title">Your products</h2>
                <p>Manage what Mentionish searches for across communities.</p>
              </div>
              <span className="result-count">
                {products.length}{" "}
                {products.length === 1 ? "product" : "products"}
              </span>
            </div>

            {products.length === 0 && !loadError ? (
              <div className="dashboard-empty">
                <span className="empty-icon" aria-hidden="true">
                  +
                </span>
                <h3>Add your first product</h3>
                <p>
                  A short, guided setup will collect your product description,
                  listening phrases, and optional voice guidance.
                </p>
                <button
                  className="primary-action"
                  type="button"
                  onClick={openCreate}
                >
                  Set up a product
                </button>
              </div>
            ) : (
              <div className="product-table">
                <div className="product-table-header" aria-hidden="true">
                  <span>Product</span>
                  <span>Listening phrases</span>
                  <span>Source</span>
                  <span>Last updated</span>
                  <span>Actions</span>
                </div>
                {products.map((product) => (
                  <article className="product-row" key={product.id}>
                    <div className="product-identity">
                      <span className="product-monogram">
                        {product.name.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <h3>{product.name}</h3>
                        <p>{product.description}</p>
                      </div>
                    </div>
                    <div className="keyword-summary">
                      <strong>{product.keywords.length}</strong>
                      <span>{product.keywords.slice(0, 2).join(", ")}</span>
                    </div>
                    <div>
                      <span className="source-pill">
                        <span className="health-dot" />
                        HN ready
                      </span>
                    </div>
                    <time dateTime={product.updated_at}>
                      {new Date(product.updated_at).toLocaleDateString()}
                    </time>
                    <div className="row-actions">
                      <button
                        className="secondary-action small-action"
                        type="button"
                        disabled={pending !== null}
                        onClick={() => openEdit(product)}
                      >
                        Edit
                      </button>
                      <button
                        className="text-danger"
                        type="button"
                        disabled={pending !== null}
                        onClick={() => void removeProduct(product)}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {formOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={closeForm}
        >
          <section
            className="setup-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <p className="page-kicker">
                  {editingId ? "Product settings" : "Guided setup"}
                </p>
                <h2 id="setup-title">
                  {editingId ? "Edit your product" : "Add a product"}
                </h2>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label="Close setup"
                onClick={closeForm}
              >
                x
              </button>
            </header>

            <ol className="setup-progress">
              {["Product", "Phrases", "Voice"].map((label, index) => {
                const number = index + 1;
                return (
                  <li
                    className={
                      number === step
                        ? "progress-step progress-current"
                        : number < step
                          ? "progress-step progress-complete"
                          : "progress-step"
                    }
                    key={label}
                  >
                    <span>{number < step ? "OK" : number}</span>
                    {label}
                  </li>
                );
              })}
            </ol>

            <form
              className="setup-form"
              onSubmit={(event) => void saveProduct(event)}
            >
              {step === 1 ? (
                <fieldset>
                  <legend>Tell us what you are building</legend>
                  <p className="field-intro">
                    This context helps Mentionish distinguish useful
                    conversations from simple keyword mentions.
                  </p>
                  <label htmlFor="product-name">Product name</label>
                  <input
                    id="product-name"
                    maxLength={80}
                    autoFocus
                    required
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                    placeholder="e.g. Acme Analytics"
                  />
                  <div className="field-heading">
                    <label htmlFor="product-description">
                      What problem does it solve?
                    </label>
                    <span>{form.description.length}/2000</span>
                  </div>
                  <textarea
                    id="product-description"
                    maxLength={2000}
                    required
                    rows={6}
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                    placeholder="Describe who it helps, their problem, and the outcome your product provides."
                  />
                </fieldset>
              ) : null}

              {step === 2 ? (
                <fieldset>
                  <legend>Add listening phrases</legend>
                  <p className="field-intro">
                    Use phrases a real customer might write when asking for help
                    or comparing solutions. One phrase per line works best.
                  </p>
                  <div className="field-heading">
                    <label htmlFor="product-keywords">Customer phrases</label>
                    <span>{keywords.length}/25</span>
                  </div>
                  <textarea
                    id="product-keywords"
                    autoFocus
                    required
                    rows={9}
                    value={form.keywords}
                    onChange={(event) =>
                      setForm({ ...form, keywords: event.target.value })
                    }
                    placeholder={
                      "reduce customer churn\ncustomer retention software\nwhy are users cancelling"
                    }
                  />
                  <div className="example-box">
                    <strong>Good phrases are specific</strong>
                    <span>
                      Include problems, questions, alternatives, and category
                      terms. You can edit these later.
                    </span>
                  </div>
                </fieldset>
              ) : null}

              {step === 3 ? (
                <fieldset>
                  <legend>Set your response style</legend>
                  <p className="field-intro">
                    Optional guidance keeps future drafts aligned with your
                    voice. Nothing will ever be posted automatically.
                  </p>
                  <label htmlFor="voice-persona">
                    Voice guidance <span className="optional">(optional)</span>
                  </label>
                  <textarea
                    id="voice-persona"
                    autoFocus
                    maxLength={1000}
                    rows={5}
                    value={form.voicePersona}
                    onChange={(event) =>
                      setForm({ ...form, voicePersona: event.target.value })
                    }
                    placeholder="Helpful and direct. Share practical detail before mentioning the product. Avoid sales language."
                  />
                  <div className="setup-summary">
                    <span className="summary-mark">M</span>
                    <div>
                      <strong>Ready to start listening</strong>
                      <p>
                        {form.name || "Your product"} will track{" "}
                        {keywords.length}{" "}
                        {keywords.length === 1 ? "phrase" : "phrases"} on Hacker
                        News. Reddit stays off until its credentials are added.
                      </p>
                    </div>
                  </div>
                </fieldset>
              ) : null}

              {formError ? (
                <p className="inline-error" role="alert">
                  {formError}
                </p>
              ) : null}

              <footer className="modal-footer">
                <button
                  className="secondary-action"
                  type="button"
                  disabled={pending === "save"}
                  onClick={step === 1 ? closeForm : () => setStep(step - 1)}
                >
                  {step === 1 ? "Cancel" : "Back"}
                </button>
                {step < 3 ? (
                  <button
                    className="primary-action"
                    type="button"
                    onClick={continueForm}
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    className="primary-action"
                    type="submit"
                    disabled={pending === "save"}
                  >
                    {pending === "save"
                      ? "Saving product..."
                      : editingId
                        ? "Save changes"
                        : "Start listening"}
                  </button>
                )}
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
