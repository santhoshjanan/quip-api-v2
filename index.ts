"use strict";

import fastify from "fastify";
import { megaByte, validMimeTypes, standardiseFileName } from "./library";
import { DiscStorage } from "formzilla/DiscStorage";
import * as jwt from "jsonwebtoken";
import "./schemaTypes/point";
import "./schemaTypes/url";
import * as path from "path";

const isProdEnv = process.env.NODE_ENV === "production";
if (!isProdEnv) {
	require("dotenv").config();
}

require("mongoose")
	.connect(process.env.DB_CONNECTION as string)
	.then(() => {
		console.log("Connected to the database");
	})
	.catch(() => {
		console.log("Unable to connect to the database");
	});
require("cloudinary").v2.config({
	cloud_name: process.env.CLOUD_BUCKET,
	api_key: process.env.CLOUD_API_KEY,
	api_secret: process.env.CLOUD_API_SECRET
});

const allowedOrigins = process.env.ALLOW_ORIGINS || "";
const server = fastify();
server.register(require("@fastify/helmet"));
server.addHook("onRequest", async (request, reply) => {
	const origin = request.headers.origin || "";
	reply.header("Access-Control-Allow-Origin", (allowedOrigins.indexOf(`${origin};`) > -1 && origin) || "*");
	reply.header("Access-Control-Allow-Credentials", true);
	reply.header("Access-Control-Allow-Headers", "Authorization, Origin, X-Requested-With, Content-Type, Accept, X-Slug, X-UID");
	reply.header("Access-Control-Allow-Methods", "OPTIONS, POST, PUT, PATCH, GET, DELETE");
	if (request.method === "OPTIONS") {
		reply.status(200).send();
	}
});
server.register(require("formzilla"), {
	limits: {
		fileSize: megaByte * 5
	},
	storage: new DiscStorage(file => {
		[file.type, file.subType] = file.mimeType.split("/");
		const isValid = validMimeTypes.some(mimeType => mimeType === file.type);
		if (!isValid) {
			throw new Error("Invalid file type");
		}
		return {
			directory: path.join(__dirname, "public"),
			fileName: standardiseFileName(file.originalName)
		};
	})
});
if (!isProdEnv) {
	server.register(require("@fastify/swagger"), {
		openapi: {
			version: "3.0.0",
			components: {
				securitySchemes: {
					Bearer: {
						type: "apiKey",
						name: "Authorization",
						in: "header",
						description: "Enter your bearer token in the format **Bearer &#x3C;token&#x3E;**"
					}
				}
			},
			security: [
				{
					Bearer: []
				}
			]
		}
	});
	server.register(require("@fastify/swagger-ui"), {
		routePrefix: "/swagger"
	});
}
server.decorateRequest("userInfo", null as unknown as UserInfo);
server.addHook("onRequest", async (request, reply) => {
	try {
		const authToken = request.headers.authorization?.replace(/^bearer\s+/i, "");
		request.userInfo = authToken && (jwt.verify(authToken, process.env.JWT_AUTH_SECRET as string) as UserInfo);
	} catch (err) {}
});
server.register(require("./routes/index.router"));
server.register(require("./routes/auth.router"), { prefix: "/auth" });
server.register(require("./routes/users.router"), { prefix: "/users" });
server.register(require("./routes/lists.router"), { prefix: "/lists" });
server.register(require("./routes/posts.router"), { prefix: "/posts" });
server.register(require("./routes/search.router"), { prefix: "/search" });
server.register(require("./routes/settings.router"), { prefix: "/settings" });
server.setErrorHandler(async (error, request, reply) => {
	reply.send(error);
});
server.listen(
	{
		port: +(process.env.PORT as string) || 3072,
		host: process.env.HOST || "::"
	},
	(err, address) => {
		if (err) {
			console.log(err.message);
			process.exit(1);
		}
		console.log(`Listening on ${address}`);
	}
);