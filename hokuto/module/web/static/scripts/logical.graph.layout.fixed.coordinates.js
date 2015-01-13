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
define(function() {
	return function(graph, hosts, hostgroup) {

		// Store the X and Y coordinates in arrays
		var coordX = [];
		var coordY = [];

		// Initialize the X and Y coordinates variables
		for (var i=0; i<graph_allhosts.length; i++){
			coordX.push(parseFloat(graph_allhosts[i].x));
			coordY.push(parseFloat(graph_allhosts[i].y));
		}

		// Adding the nodes according to the data of graph_allhosts
		for (var i=0; i<coordX.length; i++){
			coordinateX = coordX[i];
			coordinateY = coordY[i];
			graph.addNode(graph_allhosts[i].id, { 'label': graph_allhosts[i].name, 'type': 'host', x:coordinateX, y:coordinateY});
		}

		// Adding the edges according to the conditions for logical dependencies
		for (var hid in hosts) {
			// Create links based on host relationships
			var h = hosts[hid];
			for (var hid2 in h.required_hosts) {
				if (hid2 in hosts) {
					graph.addEdge(hid, hid2);
				}
			}
			for (var hid2 in h.dependent_hosts) {
				if (hid2 in hosts) {
					graph.addEdge(hid2, hid);
				}
			}

			// Create links based on service relationships
			for (var sid in h.services) {
				var s = h.services[sid];
				for (var sid2 in s.required_services) {
					var s2 = structure.services[sid2];
					if (s2.host in hosts) {
						graph.addEdge(s.host, s2.host);
					}
				}
				for (var sid2 in s.dependent_services) {
					var s2 = structure.services[sid2];
					if (s2.host in hosts) {
						graph.addEdge(s2.host, s.host);
					}
				}
			}
		}
	}
});
