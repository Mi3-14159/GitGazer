export const getLogger = () => {
    return console;
}

export const loggable = (memberName = 'logger') => {
    return (target: Function): void => {
        target.prototype[memberName] = 'Console';
    };
};
