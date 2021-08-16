# openapi2django
A NodeJS based generator, which takes in a swagger api - documentation and build boilerplate code for Django with the REST Framework.\
It was built as a quick way to kickstart the project development for my bachelor's thesis (A web-service for accessing and working with medical data based on Vue/Django).\
A such, this project is very minimal, and tailored to this specific use-case.

### Generated structure (aka How and Why)
The Script is mainly meant to generate:
- api-views (**views.py**)
- url-routing (**urls.py**)
- <s>serializers</s>

But in a way, very specific to our project\
The Route-Handler mapping from Django-rest is generated automatically, and saved to ``./urls.py.``
These in turn call the views, which are also automatically generated and saved in ``./views.py.``

But since the views are generated automatically, it's fairly impractical to place your actual application code in views.py. (You'd need to copy and paste a lot of code every time the API-Definitions changed, essentially.)\

To combat this, I came up with a solution:\
The actual implementation of any business-logic for the individual API-Routes is loaded from a file called ``api_implementation.py``.\
On top of the generated ``views.py`` is a handler-method, which searches the corresponding function (by name) from ``api_implementation.py`` and if it exists calls it.\
To further speed up development - you'd first only need to implement mission-critical calls, and care about less important ones later - if no corresponding handler is found, an empty Response with status-code 204 is returned.\

I attempted to implement automatic generation of <b>Serializers</b> based on the types used, but it turned out to be:\
a) fairly complicated to do :)\
b) uneccessary for our project

### Running the generator

#### Prerequisites
A running ``node`` + ``npm`` installation (I'm guessing any new enough version should suffice)

### Generating files

- Simply clone the project
- Install any dependencies with ``npm install`` / ``npm i``
- adjust the input path in line ``7`` to your swagger/openapi definition (either .yaml or .json should work)
- run the script with ``node generator.js``
- copy the generated ``views.py`` and ``urls.py`` into your Django project
- ???
- Profit

That should be it!

### Notes
This script is fairly specific, to our project's structure, i reckon.\
I really don't know about performance, I'm guessing it won't be too bad, but don't quote me on that ;)\
Yes, I know 'hardcoded' paths are not nice, but this was a quick and simple solution, forgive me :)



 
