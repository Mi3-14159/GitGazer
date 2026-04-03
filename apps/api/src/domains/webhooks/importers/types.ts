export type Enterprise = {
    name: string;
    id: number;
};

export const isEnterprise = (obj: any): obj is Enterprise => {
    return obj && typeof obj === 'object' && typeof obj.name === 'string' && typeof obj.id === 'number';
};
