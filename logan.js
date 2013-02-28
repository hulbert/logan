
;var Logan = (function() {

	var analyzeHttpLog = function(logLine) {
		if (logLine == undefined) return {};
	
		var logInfo = {};
		var logLine = logLine.trim();
		var logItems = logLine.split(' ');
		if (logItems.length < 17) return {};
	
		logInfo.date = logItems.slice(0,3).join(' ');
		
		logInfo.request = logLine.split('"')[1];
		
		// Edlio specific
		logInfo.custom_request_capture = logItems[17].substr(1, logItems[17].length - 2)
		
		logInfo.client = {
			ip: logItems[5].split(':')[0],
			port: logItems[5].split(':')[1]
		}
		
		// TODO accept date
		logInfo.frontend = logItems[7];
		logInfo.backend = {
			'name': logItems[8].split('/')[0],
			'server': logItems[8].split('/')[1]
		}
	
		var t = logItems[9].split('/');
		logInfo.timers = {
			'client': parseInt(t[0], 10),
			'in_queues': parseInt(t[1], 10),
			'server_cxn_established': parseInt(t[2], 10),
			'server_http_response': parseInt(t[3], 10),
			'total': parseInt(t[4], 10)
		}
		logInfo.status_code = parseInt(logItems[10], 10);
		logInfo.bytes_sent = parseInt(logItems[11], 10);
		if (logItems[12] !== '-') logInfo.captured_request_cookie = logItems[12];
		if (logItems[13] !== '-') logInfo.captured_response_cookie = logItems[13];
		
		var tState = logItems[14];
		logInfo.termination_state = {
			'cause': causeMap( tState.charAt(0) ),
			'state': stateMap( tState.charAt(1) ),
			'cookiePresence': cookiePresence( tState.charAt(2) ),
			'cookieAction': cookieAction( tState.charAt(3) ),
			'explanation': detailedExplanation( tState.substr(0,1) ),
			'raw': tState
		}
	
		var connections = logItems[15].split('/')  // '2581/2581/1942/100/0' ~ actconn '/' feconn '/' beconn '/' srv_conn '/' retries*
		logInfo.other_connections = {
			'total_concurrent': parseInt(connections[0], 10),
			'frontend': parseInt(connections[1], 10),
			'backend': parseInt(connections[2], 10),
			'server': parseInt(connections[3], 10)
		}
	
		var queues = logItems[16].split('/');
		logInfo.queues = {
			'server': parseInt(queues[0], 10),
			'backend': parseInt(queues[1], 10)
		}
		
		
		logInfo.host = logItems[3];
		logInfo.process = {
			name: logItems[4].split('[')[0],
			id: logItems[4].split('[')[1].replace(']','').replace(':','')
		}


		return logInfo;
	}

	function causeMap(char) {
		var map = {
			'C':   'the TCP session was unexpectedly aborted by the client.',
			'S':   'the TCP session was unexpectedly aborted by the server, or the server explicitly refused it.',
			'P':   'the session was prematurely aborted by the proxy, because of a connection limit enforcement, because a DENY filter was matched, because of a security check which detected and blocked a dangerous error in server response which might have caused information leak (eg: cacheable cookie), or because the response was processed by the proxy (redirect, stats, etc...).',
			'R':   'a resource on the proxy has been exhausted (memory, sockets, source ports, ...). Usually, this appears during the connection phase, and system logs should contain a copy of the precise error. If this happens, it must be considered as a very serious anomaly which should be fixed as soon as possible by any means.',
			'I':   'an internal error was identified by the proxy during a self-check. This should NEVER happen, and you are encouraged to report any log containing this, because this would almost certainly be a bug. It would be wise to preventively restart the process after such an event too, in case it would be caused by memory corruption.',
			'c':   'the client-side timeout expired while waiting for the client to send or receive data.',
			's':   'the server-side timeout expired while waiting for the server to send or receive data.',
			'-':   'normal session completion, both the client and the server closed with nothing left in the buffers.'
		}
		return map[char];
	}

	function stateMap(char) {
		var map = {
			'R':  'the proxy was waiting for a complete, valid REQUEST from the client (HTTP mode only). Nothing was sent to any server.',
			'Q':  'the proxy was waiting in the QUEUE for a connection slot. This can only happen when servers have a \'maxconn\' parameter set. It can also happen in the global queue after a redispatch consecutive to a failed attempt to connect to a dying server. If no redispatch is reported, then no connection attempt was made to any server.',
			'C':  'the proxy was waiting for the CONNECTION to establish on the server. The server might at most have noticed a connection attempt.',
			'H':  'the proxy was waiting for complete, valid response HEADERS from the server (HTTP only).',
			'D':  'the session was in the DATA phase.',
			'L':  'the proxy was still transmitting LAST data to the client while the server had already finished. This one is very rare as it can only happen when the client dies while receiving the last packets.',
			'T':  'the request was tarpitted. It has been held open with the client during the whole timeout tarpit duration or until the client closed, both of which will be reported in the "Tw" timer.',
			'-':  'normal session completion after end of data transfer',
		}
		return map[char];
	}

	// The third character tells whether the persistence cookie was provided by the client (only in HTTP mode):
	function cookiePresence(char) {
		if (char === '-') return;
		var map = {
			'N':  'the client provided NO cookie. This is usually the case for new visitors, so counting the number of occurrences of this flag in the logs generally indicate a valid trend for the site frequentation.',
			'I':  'the client provided an INVALID cookie matching no known server. This might be caused by a recent configuration change, mixed cookies between HTTP/HTTPS sites, persistence conditionally ignored, or an attack.',
			'D':  'the client provided a cookie designating a server which was DOWN, so either option persist was used and the client was sent to this server, or it was not set and the client was redispatched to another server.',
			'V':  'the client provided a valid cookie, and was sent to the associated server.',
		}
		return map[char];
	}

	function cookieAction(char) {
		if (char === '-') return;
		var map = {
			'N':  'NO cookie was provided by the server, and none was inserted either.',
			'I':  'no cookie was provided by the server, and the proxy INSERTED one. Note that in cookie insert mode, if the server provides a cookie, it will still be overwritten and reported as "I" here.',
			'P':  'a cookie was PROVIDED by the server and transmitted as-is.',
			'R':  'the cookie provided by the server was REWRITTEN by the proxy, which happens in cookie rewrite or cookie prefix modes.',
			'D':  'the cookie provided by the server was DELETED by the proxy.'
		}
	}

	function detailedExplanation(char) {
		var map = {
			'--':  'Normal termination.',
			'CC':  'The client aborted before the connection could be established to the server. This can happen when haproxy tries to connect to a recently dead (or unchecked) server, and the client aborts while haproxy is waiting for the server to respond or for timeout connect to expire.',
			'CD':  'The client unexpectedly aborted during data transfer. This can be caused by a browser crash, by an intermediate equipment between the client and haproxy which decided to actively break the connection, by network routing issues between the client and haproxy, or by a keep-alive session between the server and the client terminated first by the client.',
			'cD':  'The client did not send nor acknowledge any data for as long as the timeout client delay. This is often caused by network failures on client side, or the client simply leaving the net uncleanly.',
			'CH':  'The client aborted while waiting for the server to start responding. It might be the server taking too long to respond or the client clicking the \'Stop\' button too fast.',
			'cH':  'The timeout client stroke while waiting for client data during a POST request. This is sometimes caused by too large TCP MSS values for PPPoE networks which cannot transport full-sized packets. It can also happen when client timeout is smaller than server timeout and the server takes too long to respond.',
			'CQ':  'The client aborted while its session was queued, waiting for a server with enough empty slots to accept it. It might be that either all the servers were saturated or that the assigned server was taking too long a time to respond.',
			'CR':  'The client aborted before sending a full HTTP request. Most likely the request was typed by hand using a telnet client, and aborted too early. The HTTP status code is likely a 400 here. Sometimes this might also be caused by an IDS killing the connection between haproxy and the client.',
			'cR':  'The timeout http-request stroke before the client sent a full HTTP request. This is sometimes caused by too large TCP MSS values on the client side for PPPoE networks which cannot transport full-sized packets, or by clients sending requests by hand and not typing fast enough, or forgetting to enter the empty line at the end of the request. The HTTP status code is likely a 408 here.',
			'CT':  'The client aborted while its session was tarpitted. It is important to check if this happens on valid requests, in order to be sure that no wrong tarpit rules have been written. If a lot of them happen, it might make sense to lower the timeout tarpit value to something closer to the average reported "Tw" timer, in order not to consume resources for just a few attackers.',
			'SC':  'The server or an equipment between it and haproxy explicitly refused the TCP connection (the proxy received a TCP RST or an ICMP message in return). Under some circumstances, it can also be the network stack telling the proxy that the server is unreachable (eg: no route, or no ARP response on local network). When this happens in HTTP mode, the status code is likely a 502 or 503 here.',
			'sC':  'The timeout connect stroke before a connection to the server could complete. When this happens in HTTP mode, the status code is likely a 503 or 504 here.',
			'SD':  'The connection to the server died with an error during the data transfer. This usually means that haproxy has received an RST from the server or an ICMP message from an intermediate equipment while exchanging data with the server. This can be caused by a server crash or by a network issue on an intermediate equipment.',
			'sD':  'The server did not send nor acknowledge any data for as long as the timeout server setting during the data phase. This is often caused by too short timeouts on L4 equipments before the server (firewalls, load-balancers, ...), as well as keep-alive sessions maintained between the client and the server expiring first on haproxy.',
			'SH':  'The server aborted before sending its full HTTP response headers, or it crashed while processing the request. Since a server aborting at this moment is very rare, it would be wise to inspect its logs to control whether it crashed and why. The logged request may indicate a small set of faulty requests, demonstrating bugs in the application. Sometimes this might also be caused by an IDS killing the connection between haproxy and the server.',
			'sH':  'The timeout server stroke before the server could return its response headers. This is the most common anomaly, indicating too long transactions, probably caused by server or database saturation. The immediate workaround consists in increasing the timeout server setting, but it is important to keep in mind that the user experience will suffer from these long response times. The only long term solution is to fix the application.',
			'sQ':  'The session spent too much time in queue and has been expired. See the timeout queue and timeout connect settings to find out how to fix this if it happens too often. If it often happens massively in short periods, it may indicate general problems on the affected servers due to I/O or database congestion, or saturation caused by external attacks.',
			'PC':  'The proxy refused to establish a connection to the server because the process\' socket limit has been reached while attempting to connect. global maxconn parameter may be increased in the configuration so that it does not happen anymore. This status is very rare and might happen when the global "ulimit-n" parameter is forced by hand.',
			'PH':  'The proxy blocked the server\'s response, because it was invalid, incomplete, dangerous (cache control), or matched a security filter. In any case, an HTTP 502 error is sent to the client. One possible cause for this error is an invalid syntax in an HTTP header name containing unauthorized characters.',
			'PR':  'The proxy blocked the client\'s HTTP request, either because of an invalid HTTP syntax, in which case it returned an HTTP 400 error to the client, or because a deny filter matched, in which case it returned an HTTP 403 error.',
			'PT':  'The proxy blocked the client\'s request and has tarpitted its connection before returning it a 500 server error. Nothing was sent to the server. The connection was maintained open for as long as reported by the "Tw" timer field.',
			'RC':  'A local resource has been exhausted (memory, sockets, source ports) preventing the connection to the server from establishing. The error logs will tell precisely what was missing. This is very rare and can only be solved by proper system tuning.'
		}
		if (map.hasOwnProperty(char)) return map[char];
	}
	
	return { 'analyzeHttpLog': analyzeHttpLog };

}());

// Allow us to run from node like `node logan.js 'log line in quotes'`
if (typeof require != 'undefined' && require.main === module) {
	var logArg = process.argv[2];
	if (logArg !== undefined) {
		console.log("\n" + JSON.stringify( Logan.analyzeHttpLog(logArg), undefined, 2) );
	}
}
