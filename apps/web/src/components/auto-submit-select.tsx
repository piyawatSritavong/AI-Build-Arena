"use client";

import type { ComponentProps } from "react";

/** A <select> inside a GET form that applies itself on change (the form's button covers no-JS). */
export function AutoSubmitSelect(props: ComponentProps<"select">) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
