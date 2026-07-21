export interface CliGlobals {
  json: boolean;
  verbose: boolean;
}

const defaultGlobals: CliGlobals = {
  json: false,
  verbose: false,
};

let currentGlobals: CliGlobals = { ...defaultGlobals };

export const getCliGlobals = (): Readonly<CliGlobals> => ({ ...currentGlobals });

export const setCliGlobals = (globals: Partial<CliGlobals>): void => {
  currentGlobals = {
    ...currentGlobals,
    ...globals,
  };
};

export const resetCliGlobals = (): void => {
  currentGlobals = { ...defaultGlobals };
};
