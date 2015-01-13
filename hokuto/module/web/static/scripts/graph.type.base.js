/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2014 Omega Cube and contributors
 * Xavier Roger-Machart, xrm@omegacube.fr
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
define([], function () {
    // This is the common prototype for all graph type objects
    // It contains default values for all the members that are expected on
    // these object types

    return {
        // The technical identifier of that graph type.
        // This member should be overriden by the type object no matter what
        name: 'unknown',

        // This method should return an array of commands
        // that should be shown by the renderer for a specified node.
        getCommandsForNode: function (node) {
            return [];
        }
    };
});
