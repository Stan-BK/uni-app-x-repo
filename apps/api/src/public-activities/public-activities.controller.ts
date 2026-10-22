import { Controller, Get, Param, Query } from "@nestjs/common";
import { ListPublicActivitiesQuery } from "./dto/list-public-activities.query";
import { PublicActivitiesService } from "./public-activities.service";

@Controller("public/activities")
export class PublicActivitiesController {
  constructor(private readonly publicActivities: PublicActivitiesService) {}

  @Get()
  list(@Query() query: ListPublicActivitiesQuery) {
    return this.publicActivities.list(query);
  }

  @Get("hot")
  listHot() {
    return this.publicActivities.listHot();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.publicActivities.getById(id);
  }
}
