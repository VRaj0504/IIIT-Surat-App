const {db,run} = require("../lib/admin");

run(async () => {
    const snap = await db.collection("roster").limit(3).get();
    console.log("Documents:", snap.size);
    snap.docs.forEach((d)=>{
        console.log(d.id,d.data());
    });
});