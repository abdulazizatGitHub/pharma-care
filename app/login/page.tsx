"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Pill, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DEMO_CREDENTIALS, STORAGE_KEYS } from "@/lib/constants";
import { setData } from "@/services/storage";
import { seedData } from "@/lib/seed";
import type { AuthSession } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Simulate a short async check
    setTimeout(() => {
      if (
        username.trim() === DEMO_CREDENTIALS.username &&
        password === DEMO_CREDENTIALS.password
      ) {
        seedData();
        const session: AuthSession = {
          username: username.trim(),
          loggedInAt: new Date().toISOString(),
        };
        setData<AuthSession>(STORAGE_KEYS.AUTH, [session]);
        router.replace("/dashboard");
      } else {
        setError("Incorrect username or password. Please try again.");
        setLoading(false);
      }
    }, 400);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-purple-600/10 blur-3xl" />
      </div>

      <div
        style={{ animation: "slideUp 0.3s ease-out" }}
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-8"
      >
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center mb-4 shadow-lg shadow-indigo-200">
            <Pill size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">PharmaCare</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to manage your pharmacy</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Input
            label="Username"
            type="text"
            placeholder="admin"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
            autoComplete="username"
          />

          <div className="relative">
            <Input
              ref={passwordRef}
              label="Password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              error={error}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-9 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full mt-1"
            loading={loading}
          >
            Sign In
          </Button>
        </form>

        {/* Demo hint */}
        <div className="mt-6 p-3 rounded-xl bg-slate-50 border border-slate-200">
          <p className="text-xs text-slate-500 text-center">
            <span className="font-semibold">Demo credentials: </span>
            username: <code className="font-mono bg-slate-200 px-1 rounded">admin</code> &nbsp;/&nbsp;
            password: <code className="font-mono bg-slate-200 px-1 rounded">admin123</code>
          </p>
        </div>
      </div>
    </div>
  );
}
