const isAuthorized = (userRoles, requiredRoles) => {
    if (!userRoles || userRoles.length === 0) {
        return false;
    }

    if (requiredRoles.includes('admin') && userRoles.includes('admin')) {
        return true;
    }

    return userRoles.some(role => requiredRoles.includes(role));
};

module.exports = { isAuthorized };
