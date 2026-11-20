import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthState {
  user: User | null;
  status: AuthStatus;
  /** Starts listening for session changes. Returns a function that stops listening. */
  init: () => () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<"signed-in" | "confirm-email">;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "loading",

  init: () => {
    void supabase.auth.getSession().then(({ data }) => {
      set({
        user: data.session?.user ?? null,
        status: data.session ? "authenticated" : "anonymous",
      });
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      set({
        user: session?.user ?? null,
        status: session ? "authenticated" : "anonymous",
      });
    });
    return () => data.subscription.unsubscribe();
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  },

  signUp: async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data.session ? "signed-in" : "confirm-email";
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
}));
