# carotte
Carote accompagné de salade pour un avenir meilleur.

## Qualifiers

How works qualifiers?

```
[:type/][:routing-key][/:queue-name]

// example for direct
parcel.create
direct/parcel.create

// example for topic
topic/parcel.created/parcel.create.in.db

// example for fanout
fanout//notify

```

- topic service+name.suffix routing key plein
- fanout service+name.suffix routing key vide
