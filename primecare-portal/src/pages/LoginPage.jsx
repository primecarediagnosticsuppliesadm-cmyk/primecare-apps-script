import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { logClientError } from "@/utils/debugLogger";
import { ALLOW_LEGACY_APPS_SCRIPT } from "@/config/environment";

export default function LoginPage() {
  const { login, devLoginLocalAdmin, devLoginLocalAgent, devLoginLocalLab, devLoginLocalExecutive } =
    useAuth();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSubmitting(true);
      setErrorMessage("");

      await login({ loginId, password });
    } catch (err) {
      console.error(err);

      await logClientError({
        page: "LoginPage",
        component: "LoginPage",
        actionType: "LOGIN_FAIL",
        errorCode: "LOGIN_FAILED",
        errorMessage: err?.message || "Login failed",
        stackTrace: err?.stack || "",
        payload: {
          loginId,
        },
      });

      setErrorMessage(err?.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-3xl border bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">PrimeCare Login</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in to access your role-based PrimeCare workspace.
          </p>
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Username or Email</label>
            <input
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className="w-full rounded-xl border px-3 py-3 text-sm outline-none focus:ring"
              placeholder="e.g. qa_admin or qa.admin@primecare.test"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border px-3 py-3 text-sm outline-none focus:ring"
              placeholder="Enter password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Signing in..." : "Login"}
          </button>
        </form>

        {import.meta.env.DEV === true && ALLOW_LEGACY_APPS_SCRIPT ? (
          <div className="mt-6 border-t border-amber-200 pt-6">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-amber-800">
              Local development only
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setErrorMessage("");
                  devLoginLocalAdmin();
                }}
                className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950 hover:bg-amber-100"
              >
                Dev Login as Admin (Local Only)
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrorMessage("");
                  devLoginLocalAgent();
                }}
                className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950 hover:bg-amber-100"
              >
                Dev Login as Agent (Local Only)
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrorMessage("");
                  devLoginLocalLab();
                }}
                className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950 hover:bg-amber-100"
              >
                Dev Login as Lab (Local Only)
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrorMessage("");
                  devLoginLocalExecutive();
                }}
                className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950 hover:bg-amber-100"
              >
                Dev Login as Executive (Local Only)
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}