import { Config } from 'jest';

export default {
    preset: 'ts-jest',
    prettierPath: require.resolve('prettier-2'),
    setupFiles: [require.resolve('core-js/proposals/explicit-resource-management')],
} satisfies Config;
