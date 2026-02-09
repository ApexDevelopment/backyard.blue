# Backyard

Backyard is an AT Protocol based social network, intended to be an alternative to Tumblr and a successor to Cohost.

In this document, "developer/host" refers to the individual or organization that is deploying and maintaining the Backyard application, while "users" refers to the individuals who will be using the application frontend to create and share content.

## Functional Requirements
- Users can create accounts and log in via either their own PDS or the PDS hosted by Backyard, if the developer/host has enabled the PDS.
- User login MUST be done via the AT Protocol's OAuth system, and MUST use scoped permissions; i.e. NOT the transitional "full access" scope.
- Users can create posts with text, images, and videos.
- Users can follow other users and see their posts in a feed.
- Users can like and comment on posts.
- Users can share posts to their own feed, adding tags or a post addition (i.e. reblogging).
- Users can search for other users and posts.
- Users can customize their profile with a bio and profile picture.

## UI Requirements
- The UI will be clean and intuitive, with a focus on content.
- The UI will have a light mode and dark mode, with a toggle to switch between them.
- The feed will be organized chronologically, with the most recent posts at the top.
- The post creation interface will be simple and easy to use, allowing users to quickly create and share content.
- The profile page will display the user's profile information and their posts in chronological order.
- The profile page will NOT display the user's followers.
- The profile page will display the list of users that the user is following in a separate section, but this section can be hidden by the user if they choose to do so.

## Dependencies
- The application will be built using the AT Protocol, which provides a decentralized social networking platform. This is where user data will be stored (the user's PDS).
- The application will be built using SvelteKit, a modern web framework for building fast and efficient web applications.
- The application will use PostgreSQL for any server-side data storage needs, such as caching or analytics.
- The application will be deployable with Docker, and the default Compose file will include a default PostgreSQL database config, which can be optionally substituted by the developer/host for their own Postgres database.

In general, Backyard will be built to be web scale, with the ability to handle a large number of users and posts without performance degradation. It will come with secure defaults, but will also allow for customization and configuration by the developer/host to meet their specific needs and requirements.

# Agents
Agents must ensure they are familiar with the AT Protocol and its specification before writing any code, whether by reading https://atproto.com/ or the source code of Bluesky PBC's implementations directly at https://github.com/bluesky-social. For example, OAuth scope information can be gleaned from https://github.com/bluesky-social/atproto/tree/main/packages/oauth/oauth-scopes/src/scopes.

When important or relevant information is found in the AT Protocol documentation, agents should summarize it for future programmers in the `notes/` directory. If a file already exists in `notes/` for the relevant topic, agents should append their findings to that file rather than creating a new one.

Rather than implementing basic atproto functionality from scratch, agents should look for existing libraries that can be used to interact with the AT Protocol; starting, of course, with Bluesky's `atproto` package.