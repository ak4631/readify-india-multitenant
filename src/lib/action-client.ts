"use client";

import { invokeAction } from "@/server/actions/invoke.actions";
import { getActionErrorMessage } from "@/lib/action-error-message";
import {
  MAX_UPLOAD_SIZE_BYTES,
  UPLOAD_SIZE_MESSAGE,
} from "@/lib/upload-limits";

export function actionClient<Args extends unknown[], T>(
  action: (...args: Args) => Promise<T>,
) {
  return async (...args: Args): Promise<T> => {
    try {
      // Run before React serializes FormData: an oversized body never reaches
      // application-level validation and its production error is redacted.
      for (const arg of args) {
        if (arg instanceof FormData) {
          for (const value of arg.values()) {
            if (value instanceof File && value.size > MAX_UPLOAD_SIZE_BYTES)
              throw new Error(UPLOAD_SIZE_MESSAGE);
          }
        }
      }
      const response = await invokeAction(action, args);
      if (!response.success) throw new Error(response.message);
      return response.value;
    } catch (error) {
      throw new Error(getActionErrorMessage(error));
    }
  };
}
