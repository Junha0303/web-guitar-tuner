export type Strings = Map<string, StringBase>;

interface StringBase {
    offset: number;
    diff: number;
};
