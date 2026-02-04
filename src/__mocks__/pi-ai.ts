// Mock implementation of @mariozechner/pi-ai
// This file provides types and mock implementations for development/testing

export interface Model {
  id: string;
  provider: string;
}

export function getModel(provider: string, modelId: string): Model {
  return {
    id: modelId,
    provider,
  };
}
